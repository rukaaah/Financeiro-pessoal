import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
export declare function rotasDaAtencao<E extends object>(app: Hono<{
    Bindings: E;
}>, rodar: Rodar<E>, ptax: (env: E) => Promise<string | null>): void;
