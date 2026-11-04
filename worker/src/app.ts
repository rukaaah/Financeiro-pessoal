import type { Credenciais } from "@financeiro/dominio";
import { Hono } from "hono";
import type { Banco } from "./banco.ts";
import { consulta } from "./banco.ts";
import { comSessao } from "./sessao.ts";

export interface Dependencias<E> {
  banco(env: E): Banco;
  /** Fatia 0: sempre null (todos caem no demo). O login entra na fatia 1 (ADR-017). */
  credenciais(req: Request, env: E): Promise<Credenciais | null>;
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
      [consulta("select count(*)::int as contas from accounts")],
    );
    const ms = Date.now() - inicio;
    c.header("Server-Timing", `db;dur=${ms}`);
    c.header("Cache-Control", "no-store");
    return c.json({ modo: sessao.modo, nome: sessao.usuario.nome, contas: linhas[0]?.[0]?.contas ?? 0, ms });
  });

  return app;
}
