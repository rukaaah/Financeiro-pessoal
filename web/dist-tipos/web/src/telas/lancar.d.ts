import { type Opcoes } from "../api.ts";
/** Folha "Lançar" (06b-telas.md): abre em Gastei, com o valor focado. */
export interface Inicial {
    valor?: string | undefined;
    contaId?: string | undefined;
    categoriaId?: string | undefined;
    descricao?: string | undefined;
    contaRecorrenteId?: string | undefined;
}
export declare function Lancar({ opcoes, inicial, intencaoInicial, ptax, descontoPb, aoFechar, aoLancar, aoPrever, aoRepetir }: {
    opcoes: Opcoes | null;
    inicial?: Inicial | undefined;
    intencaoInicial?: "gastei" | "recebi" | undefined;
    ptax?: string | null;
    descontoPb?: number;
    aoFechar(): void;
    aoLancar(corpo: object): void;
    aoPrever(corpo: object): void;
    aoRepetir(conta: object, corpo: object): void;
}): import("preact").JSX.Element;
