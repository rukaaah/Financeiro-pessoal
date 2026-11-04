import type { Credenciais } from "@financeiro/dominio";
import { Hono } from "hono";
import type { Banco } from "./banco.ts";
import { consulta } from "./banco.ts";
import { apagarCookie, type Buscar, COOKIE_LOGIN, COOKIE_SESSAO, concluirLogin, criarCookieSessao, iniciarLogin } from "./auth.ts";
import { rotasDeLancamentos } from "./lancamentos.ts";
import { rotasDoMes } from "./mes.ts";
import { comSessao } from "./sessao.ts";
import type { Consulta, Linha } from "./banco.ts";
import type { Context } from "hono";

/** Roda consultas de uma rota já com o usuário da sessão fixado; devolve só as linhas delas. */
export type Rodar<E extends object> = (c: Context<{ Bindings: E }>, consultas: readonly Consulta[]) => Promise<Linha[][]>;

export interface Dependencias<E> {
  banco(env: E): Banco;
  /** O e-mail verificado do cookie de sessão, ou null (ADR-017). */
  credenciais(req: Request, env: E): Promise<Credenciais | null>;
  /** Login Google. Sem configuração, /auth/entrar responde que o login não está ligado. */
  login?(env: E): { clientId: string; clientSecret: string; segredo: string } | null;
  buscar?: Buscar;
}

export function criarApp<E extends object>(deps: Dependencias<E>) {
  const app = new Hono<{ Bindings: E }>();

  app.onError((erro, c) => {
    console.error(erro);
    return c.json({ erro: "Não deu para carregar agora. Tente de novo." }, 500);
  });

  /** Prova da stack: sessão resolvida e uma leitura sob RLS, com o tempo do banco. */
  app.get("/api/saude", async (c) => {
    const inicio = Date.now();
    const { sessao, linhas } = await comSessao(
      deps.banco(c.env),
      await deps.credenciais(c.req.raw, c.env),
      [consulta("select count(*)::int as contas, current_user as papel from accounts")],
    );
    const ms = Date.now() - inicio;
    c.header("Server-Timing", `db;dur=${ms}`);
    c.header("Cache-Control", "no-store");
    return c.json({ modo: sessao.modo, nome: sessao.usuario.nome, contas: linhas[0]?.[0]?.contas ?? 0, papel: linhas[0]?.[0]?.papel, ms });
  });

  const rodar: Rodar<E> = async (c, consultas) => {
    c.header("Cache-Control", "no-store");
    return (await comSessao(deps.banco(c.env), await deps.credenciais(c.req.raw, c.env), consultas)).linhas;
  };
  rotasDeLancamentos(app, rodar);
  rotasDoMes(app, rodar);

  app.get("/api/sessao", async (c) => {
    const { sessao } = await comSessao(deps.banco(c.env), await deps.credenciais(c.req.raw, c.env), []);
    c.header("Cache-Control", "no-store");
    return c.json({ modo: sessao.modo, nome: sessao.usuario.nome });
  });

  const configLogin = (c: { env: E; req: { url: string } }) => {
    const l = deps.login?.(c.env);
    return l ? { ...l, redirectUri: `${new URL(c.req.url).origin}/auth/callback` } : null;
  };

  app.get("/auth/entrar", async (c) => {
    const cfg = configLogin(c);
    if (!cfg) return c.text("O login ainda não está configurado neste ambiente.", 503);
    const { url, cookie } = await iniciarLogin(cfg, cfg.segredo);
    c.header("Set-Cookie", cookie);
    return c.redirect(url, 302);
  });

  app.get("/auth/callback", async (c) => {
    const cfg = configLogin(c);
    if (!cfg) return c.redirect("/", 302);
    const email = await concluirLogin(c.req.raw, cfg, cfg.segredo, deps.buscar);
    c.header("Set-Cookie", apagarCookie(COOKIE_LOGIN), { append: true });
    // Sem e-mail verificado não há sessão: a pessoa continua no demo.
    if (email) c.header("Set-Cookie", await criarCookieSessao(email, cfg.segredo), { append: true });
    return c.redirect("/", 302);
  });

  app.get("/auth/sair", (c) => {
    c.header("Set-Cookie", apagarCookie(COOKIE_SESSAO));
    return c.redirect("/", 302);
  });

  return app;
}
