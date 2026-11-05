import { type Cofrinho, type Patrimonio as Dados } from "../api.ts";
import type { Opcoes } from "../api.ts";
export type Movimento = {
    tipo: "guardar" | "resgatar";
    cofrinho: Cofrinho;
} | {
    tipo: "conciliar";
} | {
    tipo: "receber-de";
    id: string;
    nome: string;
    saldo: string;
};
export declare function Patrimonio({ dados, opcoes, aoMover, aoAvisar, aoPerguntar }: {
    dados: Dados | null;
    opcoes: Opcoes | null;
    aoMover(m: Movimento): void;
    aoAvisar(t: string): void;
    aoPerguntar(): void;
}): import("preact").JSX.Element;
export declare function Mover({ m, contas, aoFechar, aoSalvar }: {
    m: Movimento;
    contas: {
        id: string;
        nome: string;
    }[];
    aoFechar(): void;
    aoSalvar(corpo: Record<string, unknown>): void;
}): import("preact").JSX.Element;
