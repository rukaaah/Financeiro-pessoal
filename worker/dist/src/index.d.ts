export interface Env {
    DATABASE_URL: string;
    ASSETS: Fetcher;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    SESSION_SECRET?: string;
    AI?: {
        run(modelo: string, entrada: object): Promise<unknown>;
    };
}
declare const _default: import("hono").Hono<{
    Bindings: Env;
}, import("hono/types").BlankSchema, "/">;
export default _default;
