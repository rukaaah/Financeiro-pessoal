import { conferirLeituraDaIA, type LinhaLidaPelaIA, linhasComValorDeFora, paraNumeric } from "@financeiro/dominio";
import { limpar, type ModeloDeIA } from "./ia.ts";

/**
 * Leitura de extrato pela IA (pedido do Pedro, 2026-11-07). O texto do PDF é lido no
 * celular; aqui ele chega, é limpo, vai em blocos para o modelo e o que volta passa por
 * `conferirLeituraDaIA`. Nomes de pessoas, de estabelecimentos e de cofrinhos vão como
 * estão, porque a IA precisa deles para interpretar (decisão do Pedro, 2026-11-07).
 * CPF, CNPJ, e-mail e sequências longas de dígitos (conta, agência, cartão) somem.
 */

const MAX_LINHAS = 600, POR_BLOCO = 40, CONTEXTO = 6;

export function limparExtrato(texto: string): string[] {
  return texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, MAX_LINHAS).map((l) => limpar(l.slice(0, 220)));
}

export const PAPEL_EXTRATO = `Você lê extratos de conta corrente de bancos brasileiros, de qualquer banco e em qualquer formato. Recebe linhas numeradas do texto de um PDF ou de um CSV, sem CPF e sem número de conta, e devolve as movimentações de dinheiro da conta.
Para cada movimentação, um item: {"linha": número da linha onde está o valor, "trecho_valor": cópia literal do valor como está na linha (com sinal, R$, C ou D se houver), "trecho_data": cópia literal da data como está no texto (na mesma linha ou no cabeçalho do dia acima, inclusive nas linhas de contexto), "data": "AAAA-MM-DD", "descricao": a descrição como está no extrato, curta, "tipo": "gasto" | "entrada" | "guardar" | "resgatar", "cofrinho": nome do cofrinho ou null, "categoria_id": id de uma categoria da lista com o mesmo tipo (expense para gasto, income para entrada) ou null}.
"guardar" é dinheiro que sai da conta para um cofrinho (também chamado caixinha, porquinho, reserva ou objetivo); "resgatar" é dinheiro que volta de um cofrinho para a conta. Nos dois, "cofrinho" é o nome exato do cofrinho como aparece no texto, sem a palavra cofrinho.
Compra, Pix enviado, boleto, tarifa e transferência enviada são "gasto"; salário, Pix recebido, estorno e transferência recebida são "entrada". Saldo, total, limite e cabeçalho não são movimentação. Escolha a categoria pelo significado da descrição, mesmo que nunca a tenha visto; Pix ou transferência para pessoa física costuma ser gasto sem categoria clara: deixe categoria_id null se não souber. Não invente: na dúvida, deixe de fora. As linhas de contexto servem só para achar a data e o cabeçalho das colunas. Num CSV, a data e o valor estão nas colunas da própria linha.
Responda SOMENTE JSON: {"itens":[...]}`;

function jsonDe(saida: unknown): Record<string, unknown> | null {
  const texto = typeof saida === "object" && saida && "response" in saida ? (saida as { response: unknown }).response : saida;
  if (texto && typeof texto === "object") return texto as Record<string, unknown>;
  const m = /\{[\s\S]*\}/.exec(String(texto ?? ""));
  try { return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null; } catch { return null; }
}

export interface Leitura { linhas: (Omit<LinhaLidaPelaIA, "valor"> & { valor: string })[]; descartadas: number; de_fora: number; caracteres: number }

/** Lê o extrato em blocos, confere cada bloco e devolve as linhas conferidas. */
export async function lerExtratoComIA(ia: ModeloDeIA, modelo: string, texto: string, categorias: { id: string; nome: string; tipo: string }[], hoje: string): Promise<Leitura> {
  const linhas = limparExtrato(texto);
  const blocos: number[] = [];
  for (let i = 0; i < linhas.length; i += POR_BLOCO) blocos.push(i);
  let caracteres = 0;
  const respostas = await Promise.all(blocos.map(async (ini) => {
    const numeradas = (de: number, ate: number) => linhas.slice(de, ate).map((t, k) => ({ n: de + k, t }));
    const entrada = JSON.stringify({ hoje, categorias, contexto: ini > CONTEXTO ? [...numeradas(0, 1), ...numeradas(ini - CONTEXTO, ini)] : numeradas(0, ini), linhas: numeradas(ini, ini + POR_BLOCO) });
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
      categoria_id: l.categoria_id && idsValidos.get(l.categoria_id) === (l.tipo === "entrada" ? "income" : "expense") ? l.categoria_id : null,
    })),
    descartadas: conferida.descartadas,
    de_fora: linhasComValorDeFora(linhas, conferida.linhas.map((l) => l.linha)).length,
    caracteres,
  };
}
