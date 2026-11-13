import { caminhoDaSelic, type DecisaoDoCopom, lerDecisao, paragrafos } from "@financeiro/dominio";

/**
 * Selic e Copom pelas APIs públicas do site do Banco Central (dados abertos: "Atas e
 * comunicados do Copom"). O título oficial de cada comunicado diz a decisão e a taxa;
 * o texto da última reunião vai inteiro, sem resumo de IA. Cache da Cloudflare de 6 h.
 */
const BCB = "https://www.bcb.gov.br/api/servico/sitebcb/copom";
const CACHE = { cf: { cacheTtl: 21600, cacheEverything: true } } as RequestInit;

export interface Macro {
  selic: number; fase: "manutencao" | "queda" | "alta"; seguidas: number;
  antes: { acao: "reduziu" | "elevou"; reunioes: number; pontos: number | null } | null;
  ultima: { reuniao: number; data: string; titulo: string; acao: DecisaoDoCopom["acao"]; unanime: boolean | null; texto: string[] };
  ata: { reuniao: number; publicada: string } | null;
  historico: { reuniao: number; data: string; acao: DecisaoDoCopom["acao"]; taxa: number }[];
  fonte: string;
}

type Item = { nro_reuniao?: number; nroReuniao?: number; dataReferencia?: string; dataPublicacao?: string; titulo?: string; textoComunicado?: string };
const json = async (buscar: typeof fetch, url: string) => {
  const r = await buscar(url, CACHE);
  if (!r.ok) throw new Error(`BCB ${r.status}`);
  return ((await r.json()) as { conteudo?: Item[] }).conteudo ?? [];
};

export async function selicECopom(buscar: typeof fetch = fetch): Promise<Macro | null> {
  const [lista, atas] = await Promise.all([json(buscar, `${BCB}/comunicados?quantidade=16`), json(buscar, `${BCB}/atas?quantidade=1`).catch(() => [])]);
  const decisoes = lista
    .map((i) => lerDecisao(Number(i.nro_reuniao), String(i.dataReferencia ?? "").slice(0, 10), String(i.titulo ?? "")))
    .filter((d): d is DecisaoDoCopom => d != null && Number.isFinite(d.reuniao));
  const caminho = caminhoDaSelic(decisoes);
  if (!caminho) return null;
  const u = caminho.ultima;
  const [detalhe] = await json(buscar, `${BCB}/comunicados_detalhes?nro_reuniao=${u.reuniao}`).catch(() => [] as Item[]);
  const texto = paragrafos(String(detalhe?.textoComunicado ?? ""));
  const corrido = texto.join(" ");
  const ata = atas[0];
  return {
    selic: caminho.taxa, fase: caminho.fase, seguidas: caminho.seguidas, antes: caminho.antes,
    ultima: {
      reuniao: u.reuniao, data: u.data, acao: u.acao,
      titulo: String(lista.find((i) => Number(i.nro_reuniao) === u.reuniao)?.titulo ?? ""),
      unanime: corrido ? /unanimidade/i.test(corrido) : null, texto,
    },
    ata: ata?.nroReuniao ? { reuniao: ata.nroReuniao, publicada: String(ata.dataPublicacao ?? "").slice(0, 10) } : null,
    historico: caminho.historico.map(({ reuniao, data, acao, taxa }) => ({ reuniao, data, acao, taxa })),
    fonte: "Banco Central do Brasil, comunicados do Copom",
  };
}
