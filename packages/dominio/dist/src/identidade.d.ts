/**
 * Quem está usando o sistema (ADR-003, ADR-017).
 *
 * A regra é a mesma da Fase 0, em TypeScript: um e-mail só vale se o provedor afirmou
 * que o verificou; e-mail verificado e ativo em `app_users` → modo real; qualquer
 * outro → demonstração. O isolamento é o mesmo nos dois casos, pela RLS.
 */
export type ModoDeAcesso = "dono" | "demo";
export interface Credenciais {
    readonly email: string | null;
    readonly emailVerificado: boolean;
}
export interface UsuarioApp {
    readonly id: string;
    readonly email: string;
    readonly nome: string;
    readonly ehDemo: boolean;
}
export interface Sessao {
    readonly usuario: UsuarioApp;
    readonly modo: ModoDeAcesso;
}
/** O e-mail que pode ir à allowlist, ou null. Minúsculo, como `app_users.email` guarda. */
export declare function emailConfiavel(c: Credenciais | null): string | null;
/** O que o adapter devolve depois de resolver o e-mail no banco, numa só ida. */
export interface Resolucao {
    /** O e-mail casou com um usuário ativo da allowlist. */
    readonly naAllowlist: boolean;
    /** O usuário carregado: o da allowlist, ou o demo. Null se não há demo ativo. */
    readonly usuario: UsuarioApp | null;
}
export declare class DemoIndisponivel extends Error {
}
/**
 * Transforma a resolução do banco em sessão. Cair no demo é o caminho normal.
 *
 * Um usuário marcado `is_demo` nunca vira sessão de dono, mesmo que alguém o ponha na
 * allowlist: a tarja de dados fictícios depende disso.
 */
export declare function sessaoDe(r: Resolucao): Sessao;
