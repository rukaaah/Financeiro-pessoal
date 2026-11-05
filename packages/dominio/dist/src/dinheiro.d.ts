/**
 * Dinheiro em centavos inteiros (`bigint`), nunca em ponto flutuante (ADR-012, ADR-016).
 *
 * O Postgres guarda `numeric(14,2)`; o driver entrega o valor como texto, e é do texto
 * que se converte — `Number("0.1") + Number("0.2")` já é o erro que este módulo evita.
 */
export type Centavos = bigint;
/** "1234.5" → 123450n. Recusa o que não é `numeric(14,2)` em texto. */
export declare function deNumeric(texto: string): Centavos;
/** 123450n → "1234.50", para gravar como parâmetro `numeric`. */
export declare function paraNumeric(valor: Centavos): string;
/**
 * Lê o que a pessoa digitou, no formato brasileiro: "1.234,56", "42,5", "42".
 * Ponto é milhar e vírgula é decimal; mais de duas casas é erro, não arredondamento.
 */
export declare function deDigitado(texto: string): Centavos;
/** 123450n → "R$ 1.234,50"; negativo com o sinal de menos tipográfico. */
export declare function formatar(valor: Centavos): string;
export declare function somar(valores: readonly Centavos[]): Centavos;
