import { describe, expect, it } from "vitest";
import { DemoIndisponivel, emailConfiavel, sessaoDe, type UsuarioApp } from "../src/identidade.ts";

const dono: UsuarioApp = { id: "1", email: "dono@exemplo.com", nome: "Dono", ehDemo: false };
const demo: UsuarioApp = { id: "2", email: "demo@exemplo.com", nome: "Visitante", ehDemo: true };

describe("e-mail confiável", () => {
  it("só vale verificado", () => {
    expect(emailConfiavel({ email: "dono@exemplo.com", emailVerificado: false })).toBeNull();
    expect(emailConfiavel(null)).toBeNull();
  });
  it("normaliza espaços e maiúsculas", () => {
    expect(emailConfiavel({ email: "  Dono@Exemplo.COM ", emailVerificado: true })).toBe("dono@exemplo.com");
  });
  it("vazio não é e-mail", () => {
    expect(emailConfiavel({ email: "   ", emailVerificado: true })).toBeNull();
  });
});

describe("sessão", () => {
  it("na allowlist vira dono", () => {
    expect(sessaoDe({ naAllowlist: true, usuario: dono }).modo).toBe("dono");
  });
  it("fora da allowlist cai no demo", () => {
    expect(sessaoDe({ naAllowlist: false, usuario: demo })).toEqual({ usuario: demo, modo: "demo" });
  });
  it("usuário demo nunca vira dono, mesmo na allowlist", () => {
    expect(sessaoDe({ naAllowlist: true, usuario: demo }).modo).toBe("demo");
  });
  it("sem demo ativo falha alto", () => {
    expect(() => sessaoDe({ naAllowlist: false, usuario: null })).toThrow(DemoIndisponivel);
  });
});
