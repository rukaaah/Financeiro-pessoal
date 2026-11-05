import type { Banco } from "./banco.ts";
/**
 * Adapter de produção: driver serverless do Neon por HTTP. O `transaction()` roda o
 * lote numa transação não interativa, numa única ida e volta.
 */
export declare function bancoNeon(url: string): Banco;
