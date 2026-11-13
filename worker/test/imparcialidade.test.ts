import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { descarteDoFundo, montarContextoDoFundo, PAPEL_FUNDO } from "../src/ia-fundo.ts";
import { numerosConferem } from "../src/ia.ts";

/**
 * Travas de imparcialidade do chat do fundo (prompts/ia/chat-fundo.md). Cada caso é uma
 * resposta que um modelo bajulador daria a uma pergunta capciosa; o app precisa derrubá-la
 * sem depender do prompt.
 */

const posicao = [{ ticker: "TESTE11", nome: "Teste", classe: "papel", cotas: "120", preco_medio: "11.20", primeira_compra: "2025-03-02" }];
const cotacoes = [{ data: "2026-10-31", preco: "9.50", pvp: "0.95", dy_12m_pct: "12.80", liquidez: "900000" }];
const cvm = [{ mes: "2026-09", vp_cota: "10.00", dy_mes_pct: "1.05" }];
const docs = [{ id: 7001, titulo: "Relatório Gerencial", entregue_em: "2026-10-10", trecho: "Dois CRIs em renegociação." }];
const ultima = [{ data: "2026-11-12", preco: "9.40", pvp: "0.94", dy_12m_pct: "12.80" }];
const medidor = (veredito: string) => [{ dia: "2026-11-12", veredito, nota: 42, motivo: "Nada destoa.", riscos: [] }];

function contexto(veredito: string | null, pergunta = "Vale a pena aumentar a posição?", hoje = "2026-11-13") {
  return montarContextoDoFundo("TESTE11", hoje, [posicao, cotacoes, cvm, [], [], docs, [], [{ peso_na_carteira_pct: "18.50" }], ultima, veredito ? medidor(veredito) : []], { data: "12/11/2026", valor: "15.00" }, pergunta);
}

const boa = { verificado: ["Relatório Gerencial de 10/10/2026", "Informes CVM de 09/2026"], resposta: "O P/VP é 0,94 e há CRIs em renegociação.", contra: "Dois CRIs estão em renegociação no relatório de 10/10/2026.", tom: "neutro", numeros_citados: ["0.94"] };

describe("chat do fundo: travas de imparcialidade", () => {
  it("resposta neutra, com fonte real e ponto contra, passa", () => {
    expect(descarteDoFundo(boa, contexto("esperar"))).toBeNull();
  });
  it("tom favorável com o medidor em esperar, sem dados ou sem medidor é descartado", () => {
    for (const v of ["esperar", "sem_dados", null]) expect(descarteDoFundo({ ...boa, tom: "favoravel" }, contexto(v))).toMatch(/mais otimista que o medidor/);
    expect(descarteDoFundo({ ...boa, tom: "favoravel" }, contexto("bom_preco"))).toBeNull();
  });
  it("sem ponto contra é descartado", () => {
    expect(descarteDoFundo({ ...boa, contra: "" }, contexto("bom_preco"))).toMatch(/ponto contra/);
    expect(descarteDoFundo({ ...boa, contra: undefined }, contexto("bom_preco"))).toMatch(/ponto contra/);
  });
  it("fonte com data que não existe no app é descartada", () => {
    expect(descarteDoFundo({ ...boa, verificado: ["Relatório Gerencial de 15/11/2026"] }, contexto("esperar"))).toMatch(/fonte com data/);
    expect(descarteDoFundo({ ...boa, verificado: ["Informe CVM de 2026-08"] }, contexto("esperar"))).toMatch(/fonte com data/);
    expect(descarteDoFundo({ ...boa, verificado: ["Informe CVM de 2026-09", "Selic de 12/11/2026"] }, contexto("esperar"))).toBeNull();
    expect(descarteDoFundo({ ...boa, verificado: [] }, contexto("esperar"))).toMatch(/não disse o que consultou/);
  });
  it("tom fora da lista é descartado", () => {
    expect(descarteDoFundo({ ...boa, tom: "otimista" }, contexto("bom_preco"))).toMatch(/tom/);
  });
  it("preço médio só entra quando a pessoa pergunta pelo que pagou", () => {
    expect(JSON.stringify(contexto("esperar").posicao)).not.toContain("11.20");
    expect(JSON.stringify(contexto("esperar", "Quanto estou no prejuízo?").posicao)).toContain("11.20");
    expect(numerosConferem(["11.20"], contexto("esperar"))).toBe(false);
  });
  it("leva o medidor, a cotação do dia com a idade e a comparação com a Selic líquida", () => {
    const c = contexto("esperar");
    expect(c.medidor?.veredito).toBe("esperar");
    expect(c.cotacao_mais_recente).toMatchObject({ preco: "9.40", dias_desde: 1, dado_velho: false });
    expect(contexto("esperar", "x", "2026-11-20").cotacao_mais_recente?.dado_velho).toBe(true);
    expect(c.comparacao_com_selic).toMatchObject({ selic_liquida_ir_15_pct: "12.75", dy_menos_selic_liquida_ir_15_pp: "0.05" });
  });
  it("o papel não se diz analista, não compara com pares e é o mesmo do prompts/ia/chat-fundo.md", () => {
    expect(PAPEL_FUNDO).not.toMatch(/analista sênior|pares/);
    expect(PAPEL_FUNDO).toMatch(/não é analista/);
    const md = readFileSync(decodeURIComponent(new URL("../../prompts/ia/chat-fundo.md", import.meta.url).pathname), "utf8");
    expect(md).toContain("```text\n" + PAPEL_FUNDO + "\n```");
  });
});
