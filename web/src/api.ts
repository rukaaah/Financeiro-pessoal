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
