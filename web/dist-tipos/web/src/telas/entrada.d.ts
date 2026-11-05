import { type Opcoes } from "../api.ts";
import type { Inicial } from "./lancar.tsx";
/** Colar a notificação do banco: a regra lê e abre o Lançar preenchido. Nada é gravado sem conferir. */
export declare function ColarNotificacao({ opcoes, aoFechar, aoAbrir }: {
    opcoes: Opcoes | null;
    aoFechar(): void;
    aoAbrir(i: Inicial, intencao: "gastei" | "recebi"): void;
}): import("preact").JSX.Element;
export declare function ImportarExtrato({ opcoes, aoFechar, aoImportado }: {
    opcoes: Opcoes | null;
    aoFechar(): void;
    aoImportado(n: number): void;
}): import("preact").JSX.Element;
