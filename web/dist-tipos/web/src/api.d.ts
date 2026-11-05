export interface Opcoes {
    investimentos?: {
        id: string;
        nome: string;
    }[];
    contas: {
        id: string;
        nome: string;
        tipo: string;
    }[];
    categorias: {
        id: string;
        nome: string;
        tipo: "expense" | "income";
        grupo: string;
    }[];
}
export interface Lancamento {
    id: string;
    tipo: "expense" | "income" | "transfer";
    valor: string;
    data: string;
    descricao: string;
    mes_da_fatura: string | null;
    parcela: number | null;
    parcelas: number | null;
    categoria: string | null;
    conta: string;
    tipo_conta: string;
    conta_destino: string | null;
}
export interface ListaDoMes {
    mes: string;
    lancamentos: Lancamento[];
    entrou: string;
    saiu: string;
}
export declare const api: {
    sessao: () => Promise<{
        modo: "dono" | "demo";
        nome: string;
    }>;
    opcoes: () => Promise<Opcoes>;
    lancamentos: (mes: string) => Promise<ListaDoMes>;
    faturaPrevista: (conta: string, data: string) => Promise<{
        mes_da_fatura: string | null;
    }>;
    lancar: (corpo: object) => Promise<{
        ids: string[];
        mes_da_fatura: string | null;
    }>;
    editar: (id: string, corpo: object) => Promise<unknown>;
    excluir: (id: string) => Promise<{
        excluidos: number;
    }>;
};
/** "-1234.5" → "−R$ 1.234,50" (exibição apenas). */
export declare function brl(texto: string, comSinal?: boolean): string;
export declare const hoje: () => string;
export interface CategoriaDoMes {
    id: string;
    nome: string;
    grupo: string;
    previsto: string;
    gasto: string;
    media3m: string;
    ajustado: boolean;
    estado: "dentro" | "perto" | "fora";
}
export interface ItemAtencao {
    chave: string;
    gravidade: "critico" | "atencao" | "informativo";
    titulo: string;
    detalhe: string;
    valor: string;
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
}
export interface ContaDoMes {
    id: string;
    nome: string;
    valor: string;
    vencimento: string;
    urgencia: "essential" | "important" | "deferrable";
    paga: boolean;
    noCartao: boolean;
}
export interface EntradaDoMes {
    id: string;
    descricao: string;
    data: string;
    estimativa: string;
}
export interface Mes {
    atencao: ItemAtencao[];
    projecao: {
        dia: string;
        saldo: string;
    }[];
    contas: ContaDoMes[];
    entradas: EntradaDoMes[];
    ptax: string | null;
    desconto_pb: number;
    saldo_hoje: string;
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
    categorias: CategoriaDoMes[];
}
export interface DetalheCategoria {
    serie: {
        mes: string;
        gasto: string;
        previsto: string | null;
    }[];
    lancamentos: {
        id: string;
        data: string;
        descricao: string;
        valor: string;
        conta: string;
    }[];
}
export declare const apiMes: {
    mes: (mes: string) => Promise<Mes>;
    categoria: (id: string, mes: string) => Promise<DetalheCategoria>;
    previsto: (corpo: {
        categoria_id: string;
        mes: string;
        valor: string;
        padrao: boolean;
    }) => Promise<unknown>;
};
/** Centavos a partir do texto de numeric, só para comparar e desenhar barras. */
export declare const num: (t: string) => number;
export interface Fatura {
    mes: string;
    vencimento: string;
    total: string;
    pago: string;
    falta: string;
    situacao: "paga" | "parcial" | "aberta" | "atrasada" | "futura";
}
export interface Cartao {
    id: string;
    nome: string;
    fechamento: number | null;
    vencimento: number | null;
    comprometido: string;
    faturas: Fatura[];
}
export interface Compra {
    id: string;
    cartao: string;
    mes: string;
    data: string;
    descricao: string;
    valor: string;
    categoria: string | null;
    parcela: number | null;
    parcelas: number | null;
}
export declare const apiCartao: {
    cartao: () => Promise<{
        cartoes: Cartao[];
        compras: Compra[];
    }>;
    pagar: (corpo: {
        cartao_id: string;
        conta_id: string;
        mes: string;
        valor: string;
        data: string;
    }) => Promise<unknown>;
};
export declare const apiAtencao: {
    contasRecorrentes: () => Promise<{
        contas: {
            id: string;
            nome: string;
            valor: string;
            dia: number;
            categoria_id: string;
            conta_id: string;
        }[];
    }>;
    novaConta: (corpo: object) => Promise<{
        id: string;
    }>;
    novaEntrada: (corpo: object) => Promise<unknown>;
    receber: (id: string, corpo: {
        recebido: string;
        data: string;
    }) => Promise<{
        desconto: string | null;
        ptax: string | null;
    }>;
    adiar: (chave: string, ate: string | null) => Promise<unknown>;
};
export interface Cofrinho {
    id: string;
    nome: string;
    saldo: string;
    meta: string | null;
    data_meta: string | null;
    cdi: string | null;
    deveria: string | null;
    a_devolver: string;
    progresso: number | null;
}
export interface Patrimonio {
    patrimonio: string;
    partes: {
        contas: string;
        cofrinhos: string;
        investimentos: string;
        cartao: string;
    };
    a_receber: string;
    paypal: {
        total: string;
        recebimentos: number;
    };
    contas: {
        id: string;
        nome: string;
        tipo: string;
        saldo: string;
        ultimo: string | null;
        conciliado: string | null;
    }[];
    cofrinhos: Cofrinho[];
    receber: {
        id: string;
        nome: string;
        pessoa: string | null;
        saldo: string;
        itens: {
            data: string;
            descricao: string;
            valor: string;
        }[];
    }[];
}
export declare const apiPatrimonio: {
    ver: () => Promise<Patrimonio>;
    guardar: (corpo: object) => Promise<unknown>;
    resgatar: (corpo: object) => Promise<unknown>;
    receberDe: (corpo: object) => Promise<unknown>;
    conciliar: (corpo: object) => Promise<{
        diferenca: string;
    }>;
};
export interface Ativo {
    id: string;
    ticker: string;
    nome: string;
    classe: string;
    classe_nome: string;
    quantidade: number;
    preco_medio: string;
    preco: string | null;
    valor: string;
    custo: string;
    peso: number;
    variacao_pm: number;
    variacao_mes: number | null;
    pvp: number | null;
    dy: number | null;
    liquidez: number | null;
    cotado_em: string | null;
    fonte: string | null;
    atualizado_em: string | null;
    variacao_dia: number | null;
    variacao_30d: number | null;
    vp_cota: number | null;
    vp_mes: string | null;
}
export interface Investimentos {
    total: string;
    custo: string;
    variacao_mes: string;
    ativos: Ativo[];
    classes: {
        classe: string;
        nome: string;
        valor: string;
        peso: number;
        meta: number | null;
    }[];
    series: {
        mes: string;
        aporte: string;
        proventos: string;
        aportado_acumulado: string;
    }[];
    regras: {
        maxPvp: number;
        maxPeso: number;
        minLiquidez: number;
    };
    onde_aportar: {
        aporte: string;
        sugestoes: {
            ticker: string;
            valor: string;
            cotas: number | null;
            motivo: string;
        }[];
        fora: {
            ticker: string;
            motivo: string;
        }[];
        sobra: string;
        avisos: string[];
    };
    relatorio: {
        renda_mensal: string;
        alertas: {
            ticker: string;
            tipo: "oportunidade" | "atencao";
            texto: string;
        }[];
        desatualizado: string | null;
        atualizado_em: string | null;
        fonte: string | null;
    };
}
export declare const apiInvest: {
    ver: (aporte?: string) => Promise<Investimentos>;
    comprar: (corpo: object) => Promise<{
        valor: string;
    }>;
};
export interface LinhaImportada {
    data: string;
    descricao: string;
    valor: string;
    duplicada?: boolean;
    categoria_id?: string | null;
}
export declare const apiEntrada: {
    sugerir: (descricao: string, tipo: "income" | "expense") => Promise<{
        categoria_id: string | null;
    }>;
    previa: (conta_id: string, linhas: LinhaImportada[]) => Promise<{
        linhas: LinhaImportada[];
    }>;
    importar: (conta_id: string, linhas: LinhaImportada[]) => Promise<{
        importadas: number;
    }>;
};
export interface RespostaChat {
    resposta: string;
    perguntas_seguintes?: string[];
    demo?: boolean;
    tabela?: {
        funcao: string;
        linhas: Record<string, unknown>[];
    }[];
}
export declare const apiIA: {
    chat: (corpo: {
        contexto: string;
        pergunta: string;
        mes: string;
        categoria_id?: string;
    }) => Promise<RespostaChat>;
    notificacao: (texto: string) => Promise<{
        regra?: boolean;
        reconheceu?: boolean;
        valor?: string | null;
        data?: string | null;
        estabelecimento?: string | null;
        sentido?: string;
        motivo?: string;
    }>;
};
export interface Ajustes {
    contas: {
        id: string;
        nome: string;
        tipo: string;
        ativa: boolean;
    }[];
    prazos: {
        cartao: string;
        nome: string;
        fechamento: number;
        vencimento: number;
        desde: string;
    }[];
    categorias: {
        id: string;
        nome: string;
        tipo: string;
        grupo: string;
        ativa: boolean;
        previsto: string | null;
    }[];
    grupos: {
        id: string;
        nome: string;
    }[];
    regras: {
        id: string;
        contem: string;
        prioridade: number;
        categoria: string;
    }[];
    recorrentes: {
        id: string;
        nome: string;
        valor: string;
        dia: number;
        urgencia: string;
    }[];
    investimento: {
        max_pvp: number;
        max_peso: number;
        min_liquidez: number;
    } | null;
    metas: {
        classe: string;
        meta: number;
    }[];
    admin: boolean;
}
export declare const apiAjustes: {
    ver: () => Promise<Ajustes>;
    novaConta: (c: object) => Promise<unknown>;
    conta: (id: string, c: object) => Promise<unknown>;
    prazos: (id: string, c: object) => Promise<unknown>;
    novaCategoria: (c: object) => Promise<unknown>;
    categoria: (id: string, c: object) => Promise<unknown>;
    novaRegra: (c: object) => Promise<unknown>;
    apagarRegra: (id: string) => Promise<unknown>;
    encerrarRecorrente: (id: string) => Promise<unknown>;
    regrasInvestimento: (c: object) => Promise<unknown>;
    acesso: () => Promise<{
        pessoas: {
            id: string;
            email: string;
            nome: string;
            admin: boolean;
            ativa: boolean;
            demo: boolean;
        }[];
        registro: {
            quando: string;
            quem: string;
            acao: string;
            alvo: string;
        }[];
    }>;
    adicionar: (c: object) => Promise<unknown>;
    ativar: (id: string, ativa: boolean) => Promise<unknown>;
};
