import { describe, expect, it } from "vitest";
import { selicECopom } from "../src/macro.ts";

const respostas: Record<string, unknown> = {
  "comunicados?quantidade=16": { conteudo: [
    { nro_reuniao: 282, dataReferencia: "2026-11-04", titulo: "282ª reunião - Copom mantém a taxa Selic em 13,75% a.a." },
    { nro_reuniao: 281, dataReferencia: "2026-09-16", titulo: "281ª reunião - Copom reduz a taxa Selic para 13,75% a.a." },
    { nro_reuniao: 280, dataReferencia: "2026-07-29", titulo: "280ª reunião - Copom reduz a taxa Selic para 14,25% a.a." },
    { nro_reuniao: 279, dataReferencia: "2026-06-17", titulo: "279ª reunião - Copom mantém a taxa Selic em 14,75% a.a." },
    { nro_reuniao: 278, dataReferencia: "2026-05-06", titulo: "Nota sem decisão" },
  ] },
  "atas?quantidade=1": { conteudo: [{ nroReuniao: 282, dataReferencia: "2026-11-04", dataPublicacao: "2026-11-10", titulo: "282ª Reunião" }] },
  "comunicados_detalhes?nro_reuniao=282": { conteudo: [{ nro_reuniao: 282, textoComunicado: "<p>O Copom decidiu manter a taxa.</p><p>A decisão foi tomada por unanimidade.</p>" }] },
};
const falso = (async (url: string) => {
  const chave = Object.keys(respostas).find((k) => String(url).endsWith(k));
  return chave ? new Response(JSON.stringify(respostas[chave])) : new Response("", { status: 404 });
}) as typeof fetch;

describe("Selic e Copom pelo Banco Central", () => {
  it("fase, ciclo anterior e o texto da última reunião", async () => {
    const m = (await selicECopom(falso))!;
    expect([m.selic, m.fase, m.seguidas]).toEqual([13.75, "manutencao", 1]);
    expect(m.antes).toEqual({ acao: "reduziu", reunioes: 2, pontos: -1 });
    expect(m.ultima).toMatchObject({ reuniao: 282, data: "2026-11-04", acao: "manteve", unanime: true, texto: ["O Copom decidiu manter a taxa.", "A decisão foi tomada por unanimidade."] });
    expect(m.ata).toEqual({ reuniao: 282, publicada: "2026-11-10" });
    expect(m.historico).toHaveLength(4);
  });

  it("sem a lista do BCB, falha em vez de inventar", async () => {
    await expect(selicECopom((async () => new Response("", { status: 500 })) as typeof fetch)).rejects.toThrow();
  });
});
