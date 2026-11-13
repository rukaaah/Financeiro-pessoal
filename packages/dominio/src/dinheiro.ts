/**
 * Dinheiro em centavos inteiros (`bigint`), nunca em ponto flutuante (ADR-012, ADR-016).
 *
 * O Postgres guarda `numeric(14,2)`; o driver entrega o valor como texto, e é do texto
 * que se converte — `Number("0.1") + Number("0.2")` já é o erro que este módulo evita.
 */

export type Centavos = bigint;

const FORMATO = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** "1234.5" → 123450n. Recusa o que não é `numeric(14,2)` em texto. */
export function deNumeric(texto: string): Centavos {
  const m = FORMATO.exec(texto.trim());
  if (!m) throw new Error(`valor monetário inválido: ${JSON.stringify(texto)}`);
  const [, sinal, inteiro, fracao = ""] = m;
  const centavos = BigInt(inteiro!) * 100n + BigInt(fracao.padEnd(2, "0"));
  return sinal ? -centavos : centavos;
}

/** 123450n → "1234.50", para gravar como parâmetro `numeric`. */
export function paraNumeric(valor: Centavos): string {
  const negativo = valor < 0n;
  const abs = negativo ? -valor : valor;
  const texto = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return negativo ? `-${texto}` : texto;
}

/**
 * Lê o que a pessoa digitou, no formato brasileiro: "1.234,56", "42,5", "42".
 * Ponto é milhar e vírgula é decimal; mais de duas casas é erro, não arredondamento.
 */
export function deDigitado(texto: string): Centavos {
  const limpo = texto.replace(/R\$\s?/i, "").replace(/\s/g, "");
  const m = /^(-)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(limpo);
  if (!m) throw new Error(`não entendi o valor ${JSON.stringify(texto)}`);
  const [, sinal, inteiro, fracao = ""] = m;
  const centavos = BigInt(inteiro!.replace(/\./g, "")) * 100n + BigInt(fracao.padEnd(2, "0"));
  return sinal ? -centavos : centavos;
}

/** 123450n → "R$ 1.234,50"; negativo com o sinal de menos tipográfico. */
export function formatar(valor: Centavos): string {
  const negativo = valor < 0n;
  const abs = negativo ? -valor : valor;
  const inteiro = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = `R$ ${inteiro},${(abs % 100n).toString().padStart(2, "0")}`;
  return negativo ? `−${texto}` : texto;
}

export function somar(valores: readonly Centavos[]): Centavos {
  return valores.reduce((total, v) => total + v, 0n);
}
