import { CATEGORIAS_BASE, GRUPOS_BASE } from "@financeiro/dominio";
import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import type { Banco, Consulta } from "../src/banco.ts";
import { criarCategoriasBase } from "../src/categorias-base.ts";

const dono = { na_allowlist: true, id: "1", email: "dono@exemplo.com", display_name: "Dono", is_demo: false };
const ehCategoriasBase = (c: Consulta | undefined) => Boolean(c?.texto.includes("insert into categories"));

function bancoFalso() {
  const lotes: Consulta[][] = [];
  const banco: Banco = {
    async lote(consultas) {
      lotes.push([...consultas]);
      return [[{}], [dono], ...consultas.slice(2).map(() => [])];
    },
  };
  return { banco, lotes };
}

describe("categorias base na primeira entrada", () => {
  it("a consulta leva as listas do domínio e só toca quem é real e não tem categoria", () => {
    const c = criarCategoriasBase();
    expect(JSON.parse(String(c.params[0]))).toEqual(GRUPOS_BASE);
    expect(JSON.parse(String(c.params[1]))).toEqual(CATEGORIAS_BASE);
    expect(c.texto).toMatch(/current_app_user\(\) and not u\.is_demo/);
    expect(c.texto).toMatch(/not exists \(select 1 from categories\)/);
    expect(c.texto.match(/on conflict \(user_id, name\)/g)).toHaveLength(2);
    // Sem papel nem user_id vindo de fora: quem decide é o contexto fixado no lote.
    expect(c.texto).not.toMatch(/set role|owner|\$3/i);
  });

  it("/api/sessao cria as categorias no mesmo lote, depois de fixar o usuário", async () => {
    const { banco, lotes } = bancoFalso();
    const app = criarApp({ banco: () => banco, credenciais: async () => ({ email: "dono@exemplo.com", emailVerificado: true }) });
    expect(await (await app.request("/api/sessao")).json()).toEqual({ modo: "dono", nome: "Dono" });
    expect(lotes).toHaveLength(1);
    expect(lotes[0]![0]!.texto).toMatch(/^select set_config\('app\.user_id'/);
    expect(ehCategoriasBase(lotes[0]![2])).toBe(true);
  });
});
