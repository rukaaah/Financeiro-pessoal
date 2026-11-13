import { describe, expect, it } from "vitest";
import { comprometido, faturasDe, pagamentoDaFatura, vencimentoDe } from "../src/cartao.ts";

describe("faturas do cartão", () => {
  const f = faturasDe(
    [
      { mes: "2026-12-01", total: "230.00", pago: "0" },
      { mes: "2026-10-01", total: "648.40", pago: "648.40" },
      { mes: "2026-11-01", total: "843.40", pago: "0" },
      { mes: "2027-01-01", total: "230.00", pago: "0" },
      { mes: "2026-09-01", total: "500.00", pago: "200.00" },
    ],
    11, "2026-11-04",
  );
  it("paga, aberta, futuras e parcial vencida", () => {
    expect(f.map((x) => [x.mes.slice(0, 7), x.situacao])).toEqual([["2026-09", "parcial"], ["2026-10", "paga"], ["2026-11", "aberta"], ["2026-12", "futura"], ["2027-01", "futura"]]);
    expect(f[0]!.falta).toBe(30000n);
  });
  it("comprometido soma só as futuras", () => {
    expect(comprometido(f)).toBe(46000n);
  });
  it("vencimento respeita o fim de fevereiro", () => {
    expect(vencimentoDe("2027-02-01", 30)).toBe("2027-02-28");
    expect(vencimentoDe("2026-11-01", 11)).toBe("2026-11-11");
  });
});

describe("pagar ou antecipar a fatura", () => {
  const futura = { vencimento: "2027-01-11", falta: 23000n };
  it("antecipar o total quita a fatura antes do vencimento", () => {
    expect(pagamentoDaFatura(futura, 23000n, "2026-11-05")).toEqual({ ok: true, quita: true, resta: 0n, antecipado: true, diasAntes: 67 });
  });
  it("antecipar parte deixa o resto para o vencimento", () => {
    expect(pagamentoDaFatura(futura, 10000n, "2026-11-05")).toMatchObject({ ok: true, quita: false, resta: 13000n, antecipado: true });
  });
  it("no dia do vencimento ou depois não é antecipação", () => {
    expect(pagamentoDaFatura(futura, 23000n, "2027-01-11")).toMatchObject({ ok: true, antecipado: false, diasAntes: 0 });
    expect(pagamentoDaFatura(futura, 23000n, "2027-01-20")).toMatchObject({ ok: true, antecipado: false, diasAntes: 0 });
  });
  it("recusa valor zero, fatura já paga e valor acima do que falta", () => {
    expect(pagamentoDaFatura(futura, 0n, "2026-11-05")).toEqual({ ok: false, motivo: "valor-invalido" });
    expect(pagamentoDaFatura({ ...futura, falta: 0n }, 100n, "2026-11-05")).toEqual({ ok: false, motivo: "nada-a-pagar" });
    expect(pagamentoDaFatura(futura, 23001n, "2026-11-05")).toEqual({ ok: false, motivo: "acima-do-que-falta" });
  });
  it("depois de antecipar parte, a futura segue futura e o comprometido cai", () => {
    const fs = faturasDe([{ mes: "2026-11-01", total: "100.00", pago: "0" }, { mes: "2026-12-01", total: "230.00", pago: "100.00" }], 11, "2026-11-05");
    expect(fs.map((x) => x.situacao)).toEqual(["aberta", "futura"]);
    expect(comprometido(fs)).toBe(13000n);
  });
});
