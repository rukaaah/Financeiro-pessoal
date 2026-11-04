import type { Credenciais } from "@financeiro/dominio";

/**
 * Login Google por OIDC no Worker (ADR-017). Fluxo de código com PKCE e `state`;
 * o `id_token` tem a assinatura conferida pelas chaves públicas do Google e os
 * claims `iss`, `aud`, `exp` e `email_verified` checados.
 *
 * A sessão guarda só o e-mail verificado. Quem decide dono ou demo continua sendo o
 * banco, a cada pedido (`resolve_app_user` no início de todo lote): tirar alguém da
 * allowlist vale no pedido seguinte, sem esperar o cookie vencer.
 */

const ENC = new TextEncoder();
const EMISSORES = new Set(["accounts.google.com", "https://accounts.google.com"]);
export const COOKIE_SESSAO = "sessao";
export const COOKIE_LOGIN = "login";
const DURACAO_SESSAO_S = 30 * 24 * 3600;

const b64url = (dados: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(dados))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = (texto: string) => {
  const b = atob(texto.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(texto.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function chaveHmac(segredo: string) {
  return crypto.subtle.importKey("raw", ENC.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Valor assinado: `<dados em base64url>.<hmac>`. */
export async function assinar(dados: object, segredo: string): Promise<string> {
  const corpo = b64url(ENC.encode(JSON.stringify(dados)));
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac(segredo), ENC.encode(corpo));
  return `${corpo}.${b64url(assinatura)}`;
}

/** Devolve os dados se a assinatura confere e não venceu (`x`, em segundos); senão null. */
export async function abrir<T extends { x: number }>(valor: string | undefined, segredo: string, agora = Date.now() / 1000): Promise<T | null> {
  if (!valor) return null;
  const [corpo, assinatura] = valor.split(".");
  if (!corpo || !assinatura) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await chaveHmac(segredo), deB64url(assinatura), ENC.encode(corpo));
    if (!ok) return null;
    const dados = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as T;
    return typeof dados.x === "number" && dados.x > agora ? dados : null;
  } catch {
    return null;
  }
}

export interface Sessao { e: string; x: number }

export async function criarCookieSessao(email: string, segredo: string, agora = Date.now() / 1000) {
  const valor = await assinar({ e: email, x: Math.floor(agora) + DURACAO_SESSAO_S } satisfies Sessao, segredo);
  return `${COOKIE_SESSAO}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURACAO_SESSAO_S}`;
}

export const apagarCookie = (nome: string) => `${nome}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function lerCookie(req: Request, nome: string): string | undefined {
  for (const parte of (req.headers.get("cookie") ?? "").split(/;\s*/)) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i) === nome) return parte.slice(i + 1);
  }
  return undefined;
}

/** Credenciais para o domínio: só existe e-mail se ele veio de um id_token verificado. */
export async function credenciaisDoPedido(req: Request, segredo: string): Promise<Credenciais | null> {
  const s = await abrir<Sessao>(lerCookie(req, COOKIE_SESSAO), segredo);
  return s ? { email: s.e, emailVerificado: true } : null;
}

// ------------------------------------------------------------------ OIDC

export interface ConfigGoogle { clientId: string; clientSecret: string; redirectUri: string }
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

const aleatorio = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (t: string) => b64url(await crypto.subtle.digest("SHA-256", ENC.encode(t)));

/** Monta o redirecionamento para o Google e o cookie curto com `state` e o verificador PKCE. */
export async function iniciarLogin(cfg: ConfigGoogle, segredo: string, agora = Date.now() / 1000) {
  const state = aleatorio(), verificador = aleatorio(48);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: "openid email profile",
    state, code_challenge: await sha256(verificador), code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  const cookie = await assinar({ s: state, v: verificador, x: Math.floor(agora) + 600 }, segredo);
  return { url: url.toString(), cookie: `${COOKIE_LOGIN}=${cookie}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600` };
}

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }

/** Confere assinatura RS256 e claims; devolve o e-mail verificado ou null. */
export async function verificarIdToken(idToken: string, clientId: string, chaves: Jwk[], agora = Date.now() / 1000): Promise<string | null> {
  const [cab, corpo, assinatura] = idToken.split(".");
  if (!cab || !corpo || !assinatura) return null;
  const h = JSON.parse(new TextDecoder().decode(deB64url(cab))) as { alg: string; kid: string };
  const jwk = chaves.find((k) => k.kid === h.kid);
  if (h.alg !== "RS256" || !jwk) return null;
  const chave = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, deB64url(assinatura), ENC.encode(`${cab}.${corpo}`)))) return null;
  const c = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as { iss: string; aud: string; exp: number; email?: string; email_verified?: boolean | string };
  if (!EMISSORES.has(c.iss) || c.aud !== clientId || !(c.exp > agora)) return null;
  const verificado = c.email_verified === true || c.email_verified === "true";
  return verificado && c.email ? c.email.trim().toLowerCase() : null;
}

/**
 * Callback: confere `state`, troca o código pelo token e verifica o id_token.
 * Devolve o e-mail verificado, ou null em qualquer falha (quem falha cai no demo).
 */
export async function concluirLogin(req: Request, cfg: ConfigGoogle, segredo: string, buscar: Buscar = fetch): Promise<string | null> {
  const url = new URL(req.url);
  const login = await abrir<{ s: string; v: string; x: number }>(lerCookie(req, COOKIE_LOGIN), segredo);
  const code = url.searchParams.get("code");
  if (!login || !code || url.searchParams.get("state") !== login.s) return null;
  const token = await buscar("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code", code_verifier: login.v }),
  });
  if (!token.ok) return null;
  const { id_token } = (await token.json()) as { id_token?: string };
  if (!id_token) return null;
  const certs = (await (await buscar("https://www.googleapis.com/oauth2/v3/certs")).json()) as { keys: Jwk[] };
  return verificarIdToken(id_token, cfg.clientId, certs.keys);
}
