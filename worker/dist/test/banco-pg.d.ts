import type { Banco } from "../src/banco.ts";
/**
 * Adapter de teste: o mesmo contrato do `bancoNeon`, sobre `pg`, contra o Postgres do
 * docker-compose. BEGIN, as consultas em ordem, COMMIT — o que o `transaction()` do
 * Neon faz do lado de lá.
 */
export declare function bancoPg(url: string): Banco & {
    fechar(): Promise<void>;
};
