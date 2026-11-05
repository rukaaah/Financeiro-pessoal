import { type Urgencia } from "@financeiro/dominio";
export declare const hojeEmSaoPaulo: () => string;
export declare const consultasDoMes: (mes: string, hoje: string) => import("./banco.ts").Consulta[];
type L = Record<string, unknown>;
/** Monta a resposta do Mês: a posição, a Atenção e o saldo projetado, de um lote só. */
export declare function montarMes(mes: string, hoje: string, linhas: L[][], ptax: string | null): {
    mes: string;
    previsto: string;
    gasto: string;
    a_pagar: string;
    livre: string;
    por_dia: string;
    dia_do_mes: number;
    dias_no_mes: number;
    dias_restantes: number;
    renda: string;
    renda_prevista: string;
    guardado: string;
    sobra: string;
    descoberta: string | null;
    categorias: {
        id: string;
        nome: string;
        grupo: string;
        previsto: string;
        gasto: string;
        media3m: string;
        ajustado: boolean;
        estado: import("@financeiro/dominio").Estado;
    }[];
    contas: {
        valor: string;
        id: string;
        nome: string;
        vencimento: string;
        urgencia: Urgencia;
        paga: boolean;
        noCartao: boolean;
    }[];
    entradas: {
        estimativa: string;
        id: string;
        descricao: string;
        data: string;
    }[];
    ptax: string | null;
    desconto_pb: number;
    atencao: {
        valor: string;
        chave: string;
        gravidade: import("@financeiro/dominio").Gravidade;
        titulo: string;
        detalhe: string;
        data: string | null;
        acao: {
            tipo: "ver-categoria";
            id: string;
        } | {
            tipo: "pagar-conta";
            id: string;
        } | {
            tipo: "pagar-fatura";
            cartao: string;
            mes: string;
        } | {
            tipo: "receber";
            id: string;
        } | {
            tipo: "nenhuma";
        };
    }[];
    projecao: {
        dia: string;
        saldo: string;
    }[];
    saldo_hoje: string;
};
export {};
