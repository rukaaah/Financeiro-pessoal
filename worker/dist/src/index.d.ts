export interface Env {
    DATABASE_URL: string;
    ASSETS: Fetcher;
}
declare const _default: import("hono").Hono<{
    Bindings: Env;
}, import("hono/types").BlankSchema, "/">;
export default _default;
