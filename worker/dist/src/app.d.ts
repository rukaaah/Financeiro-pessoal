import type { Credenciais } from "@financeiro/dominio";
import { Hono } from "hono";
import type { Banco } from "./banco.ts";
export interface Dependencias<E> {
    banco(env: E): Banco;
    /** Fatia 0: sempre null (todos caem no demo). O login entra na fatia 1 (ADR-017). */
    credenciais(req: Request, env: E): Promise<Credenciais | null>;
}
export declare function criarApp<E extends object>(deps: Dependencias<E>): Hono<{
    Bindings: E;
}, import("hono/types").BlankSchema, "/">;
