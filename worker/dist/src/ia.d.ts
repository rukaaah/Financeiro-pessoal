import { type Sessao } from "@financeiro/dominio";
import type { Context, Hono } from "hono";
import { type Consulta, type Linha } from "./banco.ts";
/**
 * IA (ADR-018, docs/v3/04-ia.md, prompts/ia/chat.md). A IA não lê o banco: ela escolhe
 * funções de um catálogo fechado, o Worker executa sob RLS, e ela só escreve a resposta
 * com os números devolvidos. Todo número da resposta é conferido; o que não bate é
 * descartado. Demonstração nunca chama o modelo.
 */
export interface ModeloDeIA {
    run(modelo: string, entrada: object): Promise<unknown>;
}
export type RodarComSessao<E extends object> = (c: Context<{
    Bindings: E;
}>, consultas: readonly Consulta[]) => Promise<{
    sessao: Sessao;
    linhas: Linha[][];
}>;
/** Respostas fixas do modo demonstração (requisito 3 do pedido). */
export declare const RESPOSTAS_DEMO: Record<string, {
    pergunta: string;
    resposta: string;
}[]>;
/** Troca nomes de pessoas cadastradas por "pessoa A" e apaga sequências de 4+ dígitos que não sejam valor ou data. */
export declare function mascarar(texto: string, pessoas: readonly string[]): string;
/** Os números que a resposta cita precisam estar nos resultados (normalizados para 2 casas). */
export declare function numerosConferem(citados: unknown, resultados: unknown): boolean;
export declare function rotasDaIA<E extends object>(app: Hono<{
    Bindings: E;
}>, rodar: RodarComSessao<E>, modelo: (env: E) => ModeloDeIA | null): void;
