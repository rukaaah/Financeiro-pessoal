import type { Hono } from "hono";
import type { Rodar } from "./app.ts";
export declare function rotasDoCartao<E extends object>(app: Hono<{
    Bindings: E;
}>, rodar: Rodar<E>): void;
