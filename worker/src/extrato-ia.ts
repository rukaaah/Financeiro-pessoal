import { conferirLeituraDaIA, type LinhaLidaPelaIA, linhasComValorDeFora, paraNumeric } from "@financeiro/dominio";
import type { ModeloDeIA } from "./ia.ts";

/**
 * Leitura de extrato pela IA (pedido do Pedro, 2026-11-07). O texto do PDF é lido no
 * celular; aqui ele chega, é mascarado, vai em blocos para o modelo e o que volta passa
 * por `conferirLeituraDaIA`. Nomes de pessoa trocam por "pessoa A" antes do envio e
 * voltam depois; sequências longas de dígitos, CPF, CNPJ e e-mail somem e não voltam.
 * O nome do cofrinho vai como está (aprovado pelo Pedro).
 */

const MAX_LINHAS = 600, POR_BLOCO = 40, CONTEXTO = 6;

const rotulo = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Nome depois de "para"/"de" numa linha de Pix ou transferência: palavras sem dígito, até o valor ou o fim. */
const NOME_EM_PIX = /\b(pix|ted|doc|transfer[eê]ncia)\b/i;
const DEPOIS_DE = /\b(para|de|from|to)\s+((?:[A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'.]*\s?){2,6})(?=$|\s*[-+−]|\s*R\$|\s*\d)/;

export function mascararExtrato(texto: string, nomes: readonly string[]): { linhas: string[]; restaurar(s: string): string } {
  const mapa: string[] = [];
  const trocar = (nome: string) => {
    const limpo = nome.replace(/\s+/g, " ").trim();
    let i = mapa.findIndex((m) => m.toLowerCase() === limpo.toLowerCase());
    if (i < 0) { i = mapa.length; mapa.push(limpo); }
    return `pessoa ${rotulo(i)}`;
  };
  const conhecidos = nomes.map((n) => n.trim()).filter((n) => n.length > 2).sort((a, b) => b.length - a.length);
  const linhas = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, MAX_LINHAS).map((bruta) => {
    let l = bruta.slice(0, 220)
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "•••")
      .replace(/[\d*•]{3}\.[\d*•]{3}\.[\d*•]{3}-[\d*•]{2}/g, "•••")
      .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "•••");
    for (const n of conhecidos) l = l.replace(new RegExp(escapar(n), "gi"), (m) => trocar(m));
    const k = NOME_EM_PIX.exec(l)?.index;
    if (k !== undefined) l = l.slice(0, k) + l.slice(k).replace(DEPOIS_DE, (m, prep: string, nome: string) => (/^pessoa [A-Z]{1,2}$/.test(nome.trim()) ? m : `${prep} ${trocar(nome)}${nome.endsWith(" ") ? " " : ""}`));
    return l.replace(/(?<![\d.,/])(?!(?:19|20)\d{2}(?!\d))\d{4,}(?![\d.,/])/g, "•••");
  });
  return { linhas, restaurar: (s) => s.replace(/pessoa ([A-Z]{1,2})\b/g, (m, r: string) => { const i = r.length === 1 ? r.charCodeAt(0) - 65 : (r.charCodeAt(0) - 64) * 26 + r.charCodeAt(1) - 65; return mapa[i] ?? m; }) };
}

export const PAPEL_EXTRATO = `Você lê extratos de conta corrente de bancos brasileiros, de qualquer banco e em qualquer formato. Recebe linhas numeradas do texto de um PDF, já sem dados pessoais, e devolve as movimentações de dinheiro da conta.
Para cada movimentação, um item: {"linha": número da linha onde está o valor, "trecho_valor": cópia literal do valor como está na linha (com sinal, R$, C ou D se houver), "trecho_data": cópia literal da data como está no texto (na mesma linha ou no cabeçalho do dia acima, inclusive nas linhas de contexto), "data": "AAAA-MM-DD", "descricao": a descrição como está no extrato, curta, "tipo": "gasto" | "entrada" | "guardar" | "resgatar", "cofrinho": nome do cofrinho ou null, "categoria_id": id de uma categoria da lista com o mesmo tipo (expense para gasto, income para entrada) ou null}.
"guardar" é dinheiro que sai da conta para um cofrinho (também chamado caixinha, porquinho, reserva ou objetivo); "resgatar" é dinheiro que volta de um cofrinho para a conta. Nos dois, "cofrinho" é o nome exato do cofrinho como aparece no texto, sem a palavra cofrinho.
Compra, Pix enviado, boleto, tarifa e transferência enviada são "gasto"; salário, Pix recebido, estorno e transferência recebida são "entrada". Saldo, total, limite e cabeçalho não são movimentação. Escolha a categoria pelo significado da descrição, mesmo que nunca a tenha visto. Não invente: na dúvida, deixe de fora. As linhas de contexto servem só para achar a data.
Responda SOMENTE JSON: {"itens":[...]}`;

function jsonDe(saida: unknown): Record<string, unknown> | null {
  const texto = typeof saida === "object" && saida && "response" in saida ? (saida as { response: unknown }).response : saida;
  if (texto && typeof texto === "object") return texto as Record<string, unknown>;
  const m = /\{[\s\S]*\}/.exec(String(texto ?? ""));
  try { return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null; } catch { return null; }
}

export interface Leitura { linhas: (Omit<LinhaLidaPelaIA, "valor"> & { valor: string })[]; descartadas: number; de_fora: number; caracteres: number }

/** Lê o extrato em blocos, confere cada bloco e devolve as linhas já com os nomes restaurados. */
export async function lerExtratoComIA(ia: ModeloDeIA, modelo: string, texto: string, nomes: readonly string[], categorias: { id: string; nome: string; tipo: string }[], hoje: string): Promise<Leitura> {
  const { linhas, restaurar } = mascararExtrato(texto, nomes);
  const blocos: number[] = [];
  for (let i = 0; i < linhas.length; i += POR_BLOCO) blocos.push(i);
  let caracteres = 0;
  const respostas = await Promise.all(blocos.map(async (ini) => {
    const numeradas = (de: number, ate: number) => linhas.slice(de, ate).map((t, k) => ({ n: de + k, t }));
    const entrada = JSON.stringify({ hoje, categorias, contexto: numeradas(Math.max(0, ini - CONTEXTO), ini), linhas: numeradas(ini, ini + POR_BLOCO) });
    caracteres += entrada.length;
    try {
      const r = jsonDe(await ia.run(modelo, { messages: [{ role: "system", content: PAPEL_EXTRATO }, { role: "user", content: entrada }], max_tokens: 4000, temperature: 0 }));
      return Array.isArray(r?.itens) ? (r!.itens as unknown[]) : [];
    } catch { return []; }
  }));
  const conferida = conferirLeituraDaIA(linhas, respostas.flat(), hoje);
  const idsValidos = new Map(categorias.map((k) => [k.id, k.tipo]));
  return {
    linhas: conferida.linhas.map((l) => ({
      ...l,
      valor: paraNumeric(l.valor),
      descricao: restaurar(l.descricao),
      cofrinho: l.cofrinho ? restaurar(l.cofrinho) : null,
      categoria_id: l.categoria_id && idsValidos.get(l.categoria_id) === (l.tipo === "entrada" ? "income" : "expense") ? l.categoria_id : null,
    })),
    descartadas: conferida.descartadas,
    de_fora: linhasComValorDeFora(linhas, conferida.linhas.map((l) => l.linha)).length,
    caracteres,
  };
}
