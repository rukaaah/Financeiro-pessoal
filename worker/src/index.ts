import { criarApp } from "./app.ts";
import { bancoNeon } from "./banco-neon.ts";

export interface Env {
  DATABASE_URL: string;
  ASSETS: Fetcher;
}

export default criarApp<Env>({
  banco: (env) => bancoNeon(env.DATABASE_URL),
  credenciais: async () => null,
});
