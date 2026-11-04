import { type Credenciais, type Sessao } from "@financeiro/dominio";
import { type Banco, type Consulta, type Linha } from "./banco.ts";
/**
 * As duas consultas que abrem todo lote: fixam o usuário da transação e carregam a
 * linha dele. `resolve_app_user` e `demo_app_user` são as funções SECURITY DEFINER da
 * migration 001, que rodam antes de haver contexto.
 */
export declare function abrirLote(credenciais: Credenciais | null): Consulta[];
export declare function sessaoDoLote(linhas: Linha[] | undefined): Sessao;
/** Roda as consultas de uma rota já com o usuário fixado; devolve a sessão e o resto. */
export declare function comSessao(banco: Banco, credenciais: Credenciais | null, consultas: readonly Consulta[]): Promise<{
    sessao: Sessao;
    linhas: Linha[][];
}>;
