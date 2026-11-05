import type { Credenciais } from "@financeiro/dominio";
import { Hono } from "hono";
import type { Banco } from "./banco.ts";
import { type Buscar } from "./auth.ts";
import { type ModeloDeIA } from "./ia.ts";
import type { Consulta, Linha } from "./banco.ts";
import type { Context } from "hono";
/** Roda consultas de uma rota já com o usuário da sessão fixado; devolve só as linhas delas. */
export type Rodar<E extends object> = (c: Context<{
    Bindings: E;
}>, consultas: readonly Consulta[]) => Promise<Linha[][]>;
export interface Dependencias<E> {
    banco(env: E): Banco;
    /** O e-mail verificado do cookie de sessão, ou null (ADR-017). */
    credenciais(req: Request, env: E): Promise<Credenciais | null>;
    /** Login Google. Sem configuração, /auth/entrar responde que o login não está ligado. */
    login?(env: E): {
        clientId: string;
        clientSecret: string;
        segredo: string;
    } | null;
    buscar?: Buscar;
    /** PTAX de venda do dia (Banco Central). Sem ela, entrada em dólar fica sem estimativa. */
    ptax?(env: E): Promise<string | null>;
    /** Workers AI pelo binding; sem ele, a IA fica desligada. */
    ia?(env: E): ModeloDeIA | null;
}
export declare function criarApp<E extends object>(deps: Dependencias<E>): Hono<{
    Bindings: E;
}, import("hono/types").BlankSchema, "/">;
