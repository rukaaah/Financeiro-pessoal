import { type Opcoes } from "../api.ts";
export declare function Investimentos({ opcoes, aoAvisar, aoPerguntar }: {
    opcoes: Opcoes | null;
    aoAvisar(t: string): void;
    aoPerguntar(): void;
}): import("preact").JSX.Element;
