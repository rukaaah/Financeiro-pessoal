import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import { abrir, assinar, concluirLogin, credenciaisDoPedido, criarCookieSessao, iniciarLogin, verificarIdToken } from "../src/auth.ts";
import type { Banco } from "../src/banco.ts";

const SEGREDO = "segredo-de-teste-com-mais-de-32-bytes!!";
const CLIENT = "cliente.apps.googleusercontent.com";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

async function chaves() {
  const par = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("jwk", par.publicKey)) as JsonWebKey;
  return { par, jwk: { kid: "k1", kty: "RSA", n: pub.n!, e: pub.e! } };
}
async function idToken(par: CryptoKeyPair, claims: object, kid = "k1") {
  const corpo = `${b64({ alg: "RS256", kid })}.${b64(claims)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", par.privateKey, new TextEncoder().encode(corpo));
  return `${corpo}.${Buffer.from(sig).toString("base64url")}`;
}
const agora = 1_800_000_000;
const ok = { iss: "https://accounts.google.com", aud: CLIENT, exp: agora + 600, email: "Dono@Exemplo.com", email_verified: true };

describe("cookie assinado", () => {
  it("abre o que assinou e recusa o que foi mexido ou venceu", async () => {
    const v = await assinar({ e: "a@b.co", x: agora + 10 }, SEGREDO);
    expect(await abrir(v, SEGREDO, agora)).toMatchObject({ e: "a@b.co" });
    expect(await abrir(v.replace(/^./, "X"), SEGREDO, agora)).toBeNull();
    expect(await abrir(v, "outro-segredo-qualquer-de-32-bytes!!!", agora)).toBeNull();
    expect(await abrir(v, SEGREDO, agora + 11)).toBeNull();
  });

  it("credenciais só existem com cookie válido", async () => {
    const cookie = (await criarCookieSessao("dono@exemplo.com", SEGREDO)).split(";")[0]!;
    expect(await credenciaisDoPedido(new Request("https://x/", { headers: { cookie } }), SEGREDO)).toEqual({ email: "dono@exemplo.com", emailVerificado: true });
    expect(await credenciaisDoPedido(new Request("https://x/", { headers: { cookie: "sessao=lixo" } }), SEGREDO)).toBeNull();
  });
});

describe("id_token do Google", () => {
  it("aceita o válido e devolve o e-mail em minúsculas", async () => {
    const { par, jwk } = await chaves();
    expect(await verificarIdToken(await idToken(par, ok), CLIENT, [jwk], agora)).toBe("dono@exemplo.com");
  });
  it("recusa e-mail não verificado, outro aud, outro emissor, vencido e assinatura de outra chave", async () => {
    const { par, jwk } = await chaves();
    const outra = await chaves();
    for (const claims of [{ ...ok, email_verified: false }, { ...ok, aud: "outro" }, { ...ok, iss: "https://evil.example" }, { ...ok, exp: agora - 1 }]) {
      expect(await verificarIdToken(await idToken(par, claims), CLIENT, [jwk], agora)).toBeNull();
    }
    expect(await verificarIdToken(await idToken(outra.par, ok), CLIENT, [jwk], agora)).toBeNull();
  });
});

describe("fluxo de login", () => {
  const cfg = { clientId: CLIENT, clientSecret: "s", redirectUri: "https://app.test/auth/callback" };

  it("state diferente do cookie não troca código nenhum", async () => {
    const { cookie } = await iniciarLogin(cfg, SEGREDO);
    let chamou = false;
    const req = new Request("https://app.test/auth/callback?code=c&state=outro", { headers: { cookie: cookie.split(";")[0]! } });
    expect(await concluirLogin(req, cfg, SEGREDO, async () => { chamou = true; return new Response("{}"); })).toBeNull();
    expect(chamou).toBe(false);
  });

  it("callback válido cria a sessão; e-mail não verificado não cria", async () => {
    const { par, jwk } = await chaves();
    for (const [claims, esperaSessao] of [[{ ...ok, exp: Date.now() / 1000 + 600 }, true], [{ ...ok, exp: Date.now() / 1000 + 600, email_verified: false }, false]] as const) {
      const token = await idToken(par, claims);
      const banco: Banco = { lote: async () => [] };
      const app = criarApp({
        banco: () => banco, credenciais: async () => null,
        login: () => ({ clientId: CLIENT, clientSecret: "s", segredo: SEGREDO }),
        buscar: async (url) => new Response(JSON.stringify(url.includes("certs") ? { keys: [jwk] } : { id_token: token })),
      });
      const entrar = await app.request("https://app.test/auth/entrar");
      expect(entrar.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?.*code_challenge_method=S256/);
      const state = new URL(entrar.headers.get("location")!).searchParams.get("state")!;
      const cookieLogin = entrar.headers.get("set-cookie")!.split(";")[0]!;
      const volta = await app.request(`https://app.test/auth/callback?code=c&state=${state}`, { headers: { cookie: cookieLogin } });
      expect(volta.status).toBe(302);
      expect((volta.headers.get("set-cookie") ?? "").includes("sessao=e")).toBe(esperaSessao);
    }
  });

  it("sem configuração, o login responde que não está ligado", async () => {
    const app = criarApp({ banco: () => ({ lote: async () => [] }), credenciais: async () => null });
    expect((await app.request("https://app.test/auth/entrar")).status).toBe(503);
  });
});
