import { describe, expect, it } from "vitest";
import { caminhoDaSelic, type DecisaoDoCopom, emissoesDe, lerDecisao, paragrafos, proventosEstimados, rendimentoSobreCusto } from "../src/mercado.ts";

describe("rendimento da carteira", () => {
  it("proventos contam só as cotas que já estavam na carteira no início do mês", () => {
    const ops = [{ data: "2026-01-10", quantidade: "10" }, { data: "2026-02-15", quantidade: "10" }, { data: "2026-03-20", quantidade: "-5" }];
    const r = [{ mes: "2026-01", porCota: "1.00" }, { mes: "2026-02", porCota: "1.00" }, { mes: "2026-03", porCota: "0.90" }, { mes: "2026-04", porCota: "1.10" }];
    // jan: 0 cotas; fev: 10 × 1,00; mar: 20 × 0,90; abr: 15 × 1,10
    expect(proventosEstimados(ops, r)).toBe(1000n + 1800n + 1650n);
  });

  it("percentuais sobre o custo, separando cota e proventos", () => {
    expect(rendimentoSobreCusto(100000n, 95000n, 8000n)).toEqual({ valorizacao: -5, proventos: 8, total: 3 });
    expect(rendimentoSobreCusto(0n, 0n, 0n)).toEqual({ valorizacao: null, proventos: null, total: null });
  });
});

describe("Selic pelo Copom", () => {
  const d = (reuniao: number, titulo: string) => lerDecisao(reuniao, `2026-01-${String(reuniao % 28 + 1).padStart(2, "0")}`, titulo)!;

  it("lê o título oficial", () => {
    expect(lerDecisao(282, "2026-11-04", "282ª reunião - Copom mantém a taxa Selic em 13,75% a.a.")).toEqual({ reuniao: 282, data: "2026-11-04", acao: "manteve", taxa: 13.75 });
    expect(lerDecisao(1, "x", "Copom reduz a taxa Selic para 14,25% a.a.")?.acao).toBe("reduziu");
    expect(lerDecisao(1, "x", "Copom eleva a taxa Selic para 15,00% a.a.")?.taxa).toBe(15);
    expect(lerDecisao(1, "x", "Nota à imprensa")).toBeNull();
  });

  it("em manutenção, conta as pausas e mostra o ciclo de antes", () => {
    const h: DecisaoDoCopom[] = [
      d(276, "Copom mantém a taxa Selic em 15,00% a.a."),
      d(277, "Copom reduz a taxa Selic para 14,50% a.a."),
      d(278, "Copom reduz a taxa Selic para 14,00% a.a."),
      d(279, "Copom reduz a taxa Selic para 13,75% a.a."),
      d(280, "Copom mantém a taxa Selic em 13,75% a.a."),
      d(281, "Copom mantém a taxa Selic em 13,75% a.a."),
    ];
    const c = caminhoDaSelic(h)!;
    expect([c.fase, c.taxa, c.seguidas, c.ultima.reuniao]).toEqual(["manutencao", 13.75, 2, 281]);
    expect(c.antes).toEqual({ acao: "reduziu", reunioes: 3, pontos: -1.25 });
  });

  it("em queda, sem ciclo anterior", () => {
    const c = caminhoDaSelic([d(10, "Copom reduz a taxa Selic para 14,50% a.a."), d(9, "Copom reduz a taxa Selic para 15,00% a.a.")])!;
    expect([c.fase, c.seguidas, c.antes]).toEqual(["queda", 2, null]);
    expect(caminhoDaSelic([])).toBeNull();
  });

  it("tira o HTML do comunicado", () => {
    expect(paragrafos("<div><p>O Copom decidiu&nbsp;manter.</p><p> A <b>inflação</b> segue alta.</p></div>")).toEqual(["O Copom decidiu manter.", "A inflação segue alta."]);
  });
});

describe("histórico do fundo", () => {
  it("emissão nova é o mês em que as cotas emitidas crescem", () => {
    expect(emissoesDe([{ mes: "2026-03", cotas: "1500" }, { mes: "2026-01", cotas: "1000" }, { mes: "2026-02", cotas: "1000" }, { mes: "2026-04", cotas: "1500" }]))
      .toEqual([{ mes: "2026-03", novas: 500 }]);
  });
});
