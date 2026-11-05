/**
 * PTAX de venda do dólar, do Banco Central (API Olinda, pública e gratuita). O pedido é
 * guardado no cache da Cloudflare por 6 horas: a PTAX muda uma vez por dia útil.
 */
export declare function ptaxDeHoje(hoje: string, buscar?: typeof fetch): Promise<string | null>;
