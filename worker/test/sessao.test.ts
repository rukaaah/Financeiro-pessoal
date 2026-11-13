import { describe, expect, it } from "vitest";
import { criarApp } from "../src/app.ts";
import type { Banco, Consulta } from "../src/banco.ts";

function bancoFalso(usuario: Record<string, unknown> | null) {
  const recebidas: Consulta[][] = [];
  const banco: Banco = {
    async lote(consultas) {
      recebidas.push([...consultas]);
      return [[{}], usuario ? [usuario] : [], [{ contas: 3, papel: "app" }]];
    },
  };
  return { banco, recebidas };
}

describe("toda ida ao banco abre com o usuário fixado", () => {
  it("a primeira consulta do lote é o set_config local", async () => {
    const { banco, recebidas } = bancoFalso({ na_allowlist: false, id: "d", email: "demo@exemplo.com", display_name: "Visitante", is_demo: true });
    const app = criarApp({ banco: () => banco, credenciais: async () => null });
    const resp = await app.request("/api/saude");
    expect(resp.status).toBe(200);
    expect(recebidas[0]![0]!.texto).toMatch(/^select set_config\('app\.user_id', .*, true\)$/);
    expect(await resp.json()).toMatchObject({ modo: "demo", contas: 3 });
  });

  it("e-mail não verificado nem chega à allowlist", async () => {
    const { banco, recebidas } = bancoFalso({ na_allowlist: false, id: "d", email: "demo@exemplo.com", display_name: "Visitante", is_demo: true });
    const app = criarApp({ banco: () => banco, credenciais: async () => ({ email: "dono@exemplo.com", emailVerificado: false }) });
    await app.request("/api/saude");
    expect(recebidas[0]![0]!.params).toEqual([null]);
  });

  it("sem usuário demo, erro sem vazar detalhe", async () => {
    const { banco } = bancoFalso(null);
    const app = criarApp({ banco: () => banco, credenciais: async () => null });
    const resp = await app.request("/api/saude");
    expect(resp.status).toBe(500);
    expect(await resp.text()).not.toMatch(/app_users/);
  });
});
