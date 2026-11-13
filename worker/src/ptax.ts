/**
 * PTAX de venda do dólar, do Banco Central (API Olinda, pública e gratuita). O pedido é
 * guardado no cache da Cloudflare por 6 horas: a PTAX muda uma vez por dia útil.
 */
export async function ptaxDeHoje(hoje: string, buscar: typeof fetch = fetch): Promise<string | null> {
  const mdy = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;
  const fim = new Date(`${hoje}T12:00:00Z`), inicio = new Date(fim.getTime() - 10 * 86_400_000);
  const url = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)"
    + `?@dataInicial='${mdy(inicio)}'&@dataFinalCotacao='${mdy(fim)}'&$format=json&$select=cotacaoVenda`;
  const r = await buscar(url, { cf: { cacheTtl: 21600, cacheEverything: true } } as RequestInit);
  if (!r.ok) return null;
  const { value } = (await r.json()) as { value?: { cotacaoVenda: number }[] };
  const ultima = value?.[value.length - 1]?.cotacaoVenda;
  return typeof ultima === "number" ? ultima.toFixed(5) : null;
}
