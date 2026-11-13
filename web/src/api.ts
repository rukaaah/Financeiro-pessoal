// Cliente da API do Worker. Dinheiro chega como texto de numeric ("-42.50") e só vira
// número na hora de desenhar, como manda o ADR-012.
export interface Opcoes { investimentos?: { id: string; nome: string }[]; todas_as_contas?: { id: string; nome: string; tipo: string }[]; contas: { id: string; nome: string; tipo: string }[]; categorias: { id: string; nome: string; tipo: "expense" | "income"; grupo: string }[] }
export interface Lancamento { id: string; tipo: "expense" | "income" | "transfer"; valor: string; data: string; descricao: string; mes_da_fatura: string | null; parcela: number | null; parcelas: number | null; categoria: string | null; conta: string; tipo_conta: string; conta_destino: string | null; categoria_id: string | null; conta_id: string; conta_destino_id: string | null; tipo_conta_destino: string | null; valor_total: string | null }
export interface ListaDoMes { mes: string; lancamentos: Lancamento[]; entrou: string; saiu: string }

// O index.html já dispara /api/mes e /api/sessao antes do JavaScript chegar (no 4G isso é meio segundo).
// Cada pedido adiantado é usado uma vez só, e só se for igual ao que a tela pede.
const adiantados = (globalThis as { __adiantados?: Record<string, Promise<Response>> }).__adiantados ?? {};

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const pronto = init ? undefined : adiantados[url];
  if (pronto) delete adiantados[url];
  const r = await (pronto?.catch(() => null) ?? null) ?? await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((corpo as { erro?: string }).erro ?? "Não deu para concluir agora. Tente de novo.");
  return corpo as T;
}

export const api = {
  sessao: () => pedir<{ modo: "dono" | "demo"; nome: string }>("/api/sessao"),
  opcoes: () => pedir<Opcoes>("/api/opcoes"),
  lancamentos: (mes: string) => pedir<ListaDoMes>(`/api/lancamentos?mes=${mes}`),
  faturaPrevista: (conta: string, data: string) => pedir<{ mes_da_fatura: string | null }>(`/api/fatura-prevista?conta=${conta}&data=${data}`),
  lancar: (corpo: object) => pedir<{ ids: string[]; mes_da_fatura: string | null }>("/api/lancamentos", { method: "POST", body: JSON.stringify(corpo) }),
  editar: (id: string, corpo: object) => pedir(`/api/lancamentos/${id}`, { method: "PATCH", body: JSON.stringify(corpo) }),
  excluir: (id: string) => pedir<{ excluidos: number }>(`/api/lancamentos/${id}`, { method: "DELETE" }),
};

/** "-1234.5" → "−R$ 1.234,50" (exibição apenas). */
export function brl(texto: string, comSinal = false): string {
  const negativo = texto.startsWith("-");
  const [inteiro = "0", fracao = ""] = texto.replace("-", "").split(".");
  const t = `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fracao.padEnd(2, "0").slice(0, 2)}`;
  return negativo ? `−${t}` : comSinal ? `+${t}` : t;
}

export const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export interface CategoriaDoMes { id: string; nome: string; grupo: string; previsto: string; gasto: string; media3m: string; ajustado: boolean; estado: "dentro" | "perto" | "fora" }
export interface ItemAtencao { chave: string; gravidade: "critico" | "atencao" | "informativo"; titulo: string; detalhe: string; valor: string; data: string | null; acao: { tipo: "ver-categoria"; id: string } | { tipo: "pagar-conta"; id: string } | { tipo: "pagar-fatura"; cartao: string; mes: string } | { tipo: "receber"; id: string } | { tipo: "corrigir-cofrinho"; id: string; nome: string } | { tipo: "nenhuma" } }
export interface ContaDoMes { id: string; nome: string; valor: string; vencimento: string; urgencia: "essential" | "important" | "deferrable"; paga: boolean; noCartao: boolean }
export interface EntradaDoMes { id: string; descricao: string; data: string; estimativa: string }
export interface Mes { atencao: ItemAtencao[]; projecao: { dia: string; saldo: string }[]; contas: ContaDoMes[]; entradas: EntradaDoMes[]; ptax: string | null; desconto_pb: number; saldo_hoje: string; mes: string; previsto: string; gasto: string; a_pagar: string; livre: string; por_dia: string; dia_do_mes: number; dias_no_mes: number; dias_restantes: number; renda: string; renda_prevista: string; guardado: string; sobra: string; descoberta: string | null; descoberta_categoria: string | null; categorias: CategoriaDoMes[] }
export interface DetalheCategoria { serie: { mes: string; gasto: string; previsto: string | null }[]; lancamentos: { id: string; data: string; descricao: string; valor: string; conta: string }[] }

export const apiMes = {
  mes: (mes: string) => pedir<Mes>(`/api/mes?mes=${mes}`),
  categoria: (id: string, mes: string) => pedir<DetalheCategoria>(`/api/categoria/${id}?mes=${mes}`),
  previsto: (corpo: { categoria_id: string; mes: string; valor: string; padrao: boolean }) => pedir("/api/previsto", { method: "PUT", body: JSON.stringify(corpo) }),
};

/** Centavos a partir do texto de numeric, só para comparar e desenhar barras. */
export const num = (t: string) => Number(t);

const FMT_DIA_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const FMT_DIA_COMPLETO = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const meioDia = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);
/** "2026-11-05" → "05/11". Aceita data ou data-hora ISO. */
export const diaMes = (d: string) => FMT_DIA_MES.format(meioDia(d));
/** "2026-11-05" → "qua, 05/11/2026": o dia da semana ajuda a lembrar onde foi o gasto. */
export const diaCompleto = (d: string) => FMT_DIA_COMPLETO.format(meioDia(d)).replace(".", "");

export interface Fatura { mes: string; vencimento: string; total: string; pago: string; falta: string; situacao: "paga" | "parcial" | "aberta" | "atrasada" | "futura" }
export interface Cartao { id: string; nome: string; fechamento: number | null; vencimento: number | null; comprometido: string; faturas: Fatura[] }
export interface Compra { id: string; cartao: string; mes: string; data: string; descricao: string; valor: string; categoria: string | null; parcela: number | null; parcelas: number | null }

export const apiCartao = {
  cartao: () => pedir<{ cartoes: Cartao[]; compras: Compra[] }>("/api/cartao"),
  pagar: (corpo: { cartao_id: string; conta_id: string; mes: string; valor: string; data: string }) => pedir("/api/pagar-fatura", { method: "POST", body: JSON.stringify(corpo) }),
};

export const apiAtencao = {
  contasRecorrentes: () => pedir<{ contas: { id: string; nome: string; valor: string; dia: number; categoria_id: string; conta_id: string }[] }>("/api/contas-recorrentes"),
  novaConta: (corpo: object) => pedir<{ id: string }>("/api/contas-recorrentes", { method: "POST", body: JSON.stringify(corpo) }),
  novaEntrada: (corpo: object) => pedir("/api/entradas-previstas", { method: "POST", body: JSON.stringify(corpo) }),
  receber: (id: string, corpo: { recebido: string; data: string }) => pedir<{ desconto: string | null; ptax: string | null }>(`/api/entradas-previstas/${id}/receber`, { method: "POST", body: JSON.stringify(corpo) }),
  adiar: (chave: string, ate: string | null) => pedir("/api/atencao/adiar", { method: "POST", body: JSON.stringify({ chave, ate }) }),
};

export interface Cofrinho { id: string; nome: string; saldo: string; meta: string | null; data_meta: string | null; cdi: string | null; deveria: string | null; a_devolver: string; progresso: number | null }
export interface Patrimonio {
  patrimonio: string; partes: { contas: string; cofrinhos: string; investimentos: string; cartao: string }; a_receber: string; paypal: { total: string; recebimentos: number };
  contas: { id: string; nome: string; tipo: string; saldo: string; ultimo: string | null; conciliado: string | null }[];
  cofrinhos: Cofrinho[]; receber: { id: string; nome: string; pessoa: string | null; saldo: string; itens: { data: string; descricao: string; valor: string }[] }[];
}
export const apiPatrimonio = {
  ver: () => pedir<Patrimonio>("/api/patrimonio"),
  transferir: (corpo: object) => pedir<{ ok: boolean; id: string }>("/api/transferir", { method: "POST", body: JSON.stringify(corpo) }),
  guardar: (corpo: object) => pedir("/api/guardar", { method: "POST", body: JSON.stringify(corpo) }),
  resgatar: (corpo: object) => pedir("/api/resgatar", { method: "POST", body: JSON.stringify(corpo) }),
  receberDe: (corpo: object) => pedir("/api/receber-de", { method: "POST", body: JSON.stringify(corpo) }),
  conciliar: (corpo: object) => pedir<{ diferenca: string }>("/api/conciliar", { method: "POST", body: JSON.stringify(corpo) }),
  ajustarCofrinho: (corpo: { cofrinho_id: string; saldo: string }) => pedir<{ saldo: string }>("/api/cofrinhos/saldo", { method: "POST", body: JSON.stringify(corpo) }),
};

export interface Ativo { id: string; ticker: string; nome: string; classe: string; classe_nome: string; quantidade: number; preco_medio: string; preco: string | null; valor: string; custo: string; peso: number; variacao_pm: number; variacao_mes: number | null; pvp: number | null; dy: number | null; liquidez: number | null; cotado_em: string | null; fonte: string | null; atualizado_em: string | null; variacao_dia: number | null; variacao_30d: number | null; vp_cota: number | null; vp_mes: string | null }
export interface Investimentos {
  total: string; custo: string; variacao_mes: string; ativos: Ativo[];
  classes: { classe: string; nome: string; valor: string; peso: number; meta: number | null }[];
  series: { mes: string; aporte: string; proventos: string; aportado_acumulado: string }[];
  regras: { maxPvp: number; maxPeso: number; minLiquidez: number };
  onde_aportar: { aporte: string; sugestoes: { ticker: string; valor: string; cotas: number | null; motivo: string }[]; fora: { ticker: string; motivo: string }[]; sobra: string; avisos: string[] };
  relatorio: { renda_mensal: string; alertas: { ticker: string; tipo: "oportunidade" | "atencao"; texto: string }[]; desatualizado: string | null; atualizado_em: string | null; fonte: string | null };
}
export interface EventoFii { tipo: "data_com" | "pagamento" | "subscricao" | "assembleia" | "outro"; data: string; texto: string; documento: number }
export interface NoticiasFii {
  ticker: string; resumo: string | null; preparar: string[]; eventos: EventoFii[]; gerado_em: string | null;
  documentos: { id: number; titulo: string; categoria: string; entregue_em: string }[];
  gestao: GestaoFii | null; gestao_datas: Record<string, string> | null;
}
export interface GestaoFii {
  postura: string;
  planos: { texto: string; documento: number; trecho: string }[];
  mudancas: { tema: string; antes: string; agora: string; documento_antes: number; documento_agora: number; trecho: string }[];
}
export type Veredito = "grande_dia" | "bom_preco" | "esperar" | "sem_dados";
export interface MomentoFii {
  aporte: string;
  panorama: { dia: string; tendencia: "alta" | "queda" | "lateral" | "sem_dados"; fundos: number; acima_da_media: number; variacao_21: number | null; subindo: string[]; caindo: string[]; selic: string | null; direcao_selic: string | null } | null;
  fundos: { ticker: string; dia: string; preco: number; nota: number | null; percentil: number | null; pregoes: number; veredito: Veredito; motivo: string; riscos: string[]; previsao: string; preco_alvo: string | null; fatos: Record<string, string>; com_ia: boolean; gerado_em: string; sugestao: { cotas: number; valor: string; limite: string | null } | null }[];
}
export const apiInvest = {
  momento: (aporte?: string) => pedir<MomentoFii>(`/api/investimentos/momento${aporte ? `?aporte=${encodeURIComponent(aporte)}` : ""}`),
  noticias: () => pedir<{ noticias: NoticiasFii[] }>("/api/investimentos/noticias"),
  ver: (aporte?: string) => pedir<Investimentos>(`/api/investimentos${aporte ? `?aporte=${encodeURIComponent(aporte)}` : ""}`),
  comprar: (corpo: object) => pedir<{ valor: string }>("/api/comprar-ativo", { method: "POST", body: JSON.stringify(corpo) }),
};

export type TipoDaLinha = "gasto" | "entrada" | "guardar" | "resgatar" | "transferir";
export interface LinhaImportada { outra_conta_id?: string | null; data: string; descricao: string; valor: string; duplicada?: boolean; categoria_id?: string | null; tipo?: TipoDaLinha; cofrinho?: string | null; cofrinho_id?: string | null; finalidade?: string | null; original?: string | null }
export const apiEntrada = {
  sugerir: (descricao: string, tipo: "income" | "expense") => pedir<{ categoria_id: string | null }>(`/api/sugerir-categoria?descricao=${encodeURIComponent(descricao)}&tipo=${tipo}`),
  previa: (conta_id: string, linhas: LinhaImportada[]) => pedir<{ linhas: LinhaImportada[] }>("/api/importar/previa", { method: "POST", body: JSON.stringify({ conta_id, linhas }) }),
  importar: (conta_id: string, linhas: LinhaImportada[]) => pedir<{ importadas: number; cofrinhos_criados: number }>("/api/importar", { method: "POST", body: JSON.stringify({ conta_id, linhas }) }),
};

export interface RespostaChat { resposta: string; contra?: string; perguntas_seguintes?: string[]; demo?: boolean; verificado?: string[]; faltou?: string | null; tabela?: { funcao: string; linhas: Record<string, unknown>[] }[] }
export const apiIA = {
  chat: (corpo: { contexto: string; pergunta: string; mes: string; categoria_id?: string; ticker?: string; historico?: { eu: string; ia: string }[] }) => pedir<RespostaChat>("/api/chat", { method: "POST", body: JSON.stringify(corpo) }),
  extrato: (texto: string) => pedir<{ demo?: boolean; motivo?: string; linhas?: LinhaImportada[]; descartadas?: number; de_fora?: number }>("/api/ia/extrato", { method: "POST", body: JSON.stringify({ texto }) }),
  notificacao: (texto: string) => pedir<{ regra?: boolean; reconheceu?: boolean; valor?: string | null; data?: string | null; estabelecimento?: string | null; sentido?: string; motivo?: string }>("/api/ia/notificacao", { method: "POST", body: JSON.stringify({ texto }) }),
};

export interface Ajustes {
  contas: { id: string; nome: string; tipo: string; ativa: boolean }[]; prazos: { cartao: string; nome: string; fechamento: number; vencimento: number; desde: string }[];
  categorias: { id: string; nome: string; tipo: string; grupo: string; ativa: boolean; previsto: string | null }[]; grupos: { id: string; nome: string }[];
  regras: { id: string; contem: string; prioridade: number; categoria: string }[]; recorrentes: { id: string; nome: string; valor: string; dia: number; urgencia: string }[];
  investimento: { max_pvp: number; max_peso: number; min_liquidez: number } | null; metas: { classe: string; meta: number }[]; admin: boolean;
}
const enviar = (url: string, metodo: string, corpo?: object) => pedir(url, { method: metodo, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
export const apiAjustes = {
  ver: () => pedir<Ajustes>("/api/ajustes"),
  novaConta: (c: object) => enviar("/api/contas", "POST", c), conta: (id: string, c: object) => enviar(`/api/contas/${id}`, "PATCH", c),
  prazos: (id: string, c: object) => enviar(`/api/cartoes/${id}/prazos`, "POST", c),
  novaCategoria: (c: object) => enviar("/api/categorias", "POST", c), categoria: (id: string, c: object) => enviar(`/api/categorias/${id}`, "PATCH", c),
  novaRegra: (c: object) => enviar("/api/regras", "POST", c), apagarRegra: (id: string) => enviar(`/api/regras/${id}`, "DELETE"),
  encerrarRecorrente: (id: string) => enviar(`/api/contas-recorrentes/${id}`, "DELETE"),
  regrasInvestimento: (c: object) => enviar("/api/investimentos/regras", "PUT", c),
  acesso: () => pedir<{ pessoas: { id: string; email: string; nome: string; admin: boolean; ativa: boolean; demo: boolean }[]; registro: { quando: string; quem: string; acao: string; alvo: string }[] }>("/api/acesso"),
  adicionar: (c: object) => enviar("/api/acesso", "POST", c), ativar: (id: string, ativa: boolean) => enviar(`/api/acesso/${id}`, "PATCH", { ativa }),
};
