import { describe, expect, it } from "vitest";
import { comprometido, faturasDe, vencimentoDe } from "../src/cartao.ts";

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
