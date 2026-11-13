import { criarApp } from "./app.ts";
import { credenciaisDoPedido } from "./auth.ts";
import { bancoNeon } from "./banco-neon.ts";
import { hojeEmSaoPaulo } from "./contexto.ts";
import { selicECopom } from "./macro.ts";
import { ptaxDeHoje } from "./ptax.ts";

export interface Env {
  DATABASE_URL: string;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  AI?: { run(modelo: string, entrada: object): Promise<unknown> };
}

export default criarApp<Env>({
  banco: (env) => bancoNeon(env.DATABASE_URL),
  // Sem SESSION_SECRET não existe sessão válida: todo mundo cai no demo.
  credenciais: async (req, env) => (env.SESSION_SECRET ? credenciaisDoPedido(req, env.SESSION_SECRET) : null),
  ptax: () => ptaxDeHoje(hojeEmSaoPaulo()),
  macro: () => selicECopom(),
  ia: (env) => env.AI ?? null,
  login: (env) =>
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, segredo: env.SESSION_SECRET }
      : null,
});
