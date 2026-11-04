// Cliente da API do Worker. Dinheiro chega como texto de numeric ("-42.50") e só vira
// número na hora de desenhar, como manda o ADR-012.
export interface Opcoes { contas: { id: string; nome: string; tipo: string }[]; categorias: { id: string; nome: string; tipo: "expense" | "income"; grupo: string }[] }
export interface Lancamento { id: string; tipo: "expense" | "income" | "transfer"; valor: string; data: string; descricao: string; mes_da_fatura: string | null; parcela: number | null; parcelas: number | null; categoria: string | null; conta: string; tipo_conta: string; conta_destino: string | null }
export interface ListaDoMes { mes: string; lancamentos: Lancamento[]; entrou: string; saiu: string }

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) } });
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
export interface ItemAtencao { chave: string; gravidade: "critico" | "atencao" | "informativo"; titulo: string; detalhe: string; valor: string; data: string | null; acao: { tipo: "ver-categoria"; id: string } | { tipo: "pagar-conta"; id: string } | { tipo: "pagar-fatura"; cartao: string; mes: string } | { tipo: "receber"; id: string } | { tipo: "nenhuma" } }
export interface ContaDoMes { id: string; nome: string; valor: string; vencimento: string; urgencia: "essential" | "important" | "deferrable"; paga: boolean; noCartao: boolean }
export interface EntradaDoMes { id: string; descricao: string; data: string; estimativa: string }
export interface Mes { atencao: ItemAtencao[]; projecao: { dia: string; saldo: string }[]; contas: ContaDoMes[]; entradas: EntradaDoMes[]; ptax: string | null; desconto_pb: number; saldo_hoje: string; mes: string; previsto: string; gasto: string; a_pagar: string; livre: string; por_dia: string; dia_do_mes: number; dias_no_mes: number; dias_restantes: number; renda: string; renda_prevista: string; guardado: string; sobra: string; descoberta: string | null; categorias: CategoriaDoMes[] }
export interface DetalheCategoria { serie: { mes: string; gasto: string; previsto: string | null }[]; lancamentos: { id: string; data: string; descricao: string; valor: string; conta: string }[] }

export const apiMes = {
  mes: (mes: string) => pedir<Mes>(`/api/mes?mes=${mes}`),
  categoria: (id: string, mes: string) => pedir<DetalheCategoria>(`/api/categoria/${id}?mes=${mes}`),
  previsto: (corpo: { categoria_id: string; mes: string; valor: string; padrao: boolean }) => pedir("/api/previsto", { method: "PUT", body: JSON.stringify(corpo) }),
};

/** Centavos a partir do texto de numeric, só para comparar e desenhar barras. */
export const num = (t: string) => Number(t);

export interface Fatura { mes: string; vencimento: string; total: string; pago: string; falta: string; situacao: "paga" | "parcial" | "aberta" | "atrasada" | "futura" }
export interface Cartao { id: string; nome: string; fechamento: number | null; vencimento: number | null; comprometido: string; faturas: Fatura[] }
export interface Compra { id: string; cartao: string; mes: string; data: string; descricao: string; valor: string; categoria: string | null; parcela: number | null; parcelas: number | null }

export const apiCartao = {
  cartao: () => pedir<{ cartoes: Cartao[]; compras: Compra[] }>("/api/cartao"),
  pagar: (corpo: { cartao_id: string; conta_id: string; mes: string; valor: string; data: string }) => pedir("/api/pagar-fatura", { method: "POST", body: JSON.stringify(corpo) }),
};

export const apiAtencao = {
  contasRecorrentes: () => pedir<{ contas: { id: string; nome: string; valor: string; dia: number; categoria_id: string; conta_id: string }[] }>("/api/contas-recorrentes"),
  novaConta: (corpo: object) => pedir("/api/contas-recorrentes", { method: "POST", body: JSON.stringify(corpo) }),
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
  guardar: (corpo: object) => pedir("/api/guardar", { method: "POST", body: JSON.stringify(corpo) }),
  resgatar: (corpo: object) => pedir("/api/resgatar", { method: "POST", body: JSON.stringify(corpo) }),
  receberDe: (corpo: object) => pedir("/api/receber-de", { method: "POST", body: JSON.stringify(corpo) }),
  conciliar: (corpo: object) => pedir<{ diferenca: string }>("/api/conciliar", { method: "POST", body: JSON.stringify(corpo) }),
};
