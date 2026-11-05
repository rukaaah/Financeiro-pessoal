import type { Credenciais } from "@financeiro/dominio";
export declare const COOKIE_SESSAO = "sessao";
export declare const COOKIE_LOGIN = "login";
/** Valor assinado: `<dados em base64url>.<hmac>`. */
export declare function assinar(dados: object, segredo: string): Promise<string>;
/** Devolve os dados se a assinatura confere e não venceu (`x`, em segundos); senão null. */
export declare function abrir<T extends {
    x: number;
}>(valor: string | undefined, segredo: string, agora?: number): Promise<T | null>;
export interface Sessao {
    e: string;
    x: number;
}
export declare function criarCookieSessao(email: string, segredo: string, agora?: number): Promise<string>;
export declare const apagarCookie: (nome: string) => string;
export declare function lerCookie(req: Request, nome: string): string | undefined;
/** Credenciais para o domínio: só existe e-mail se ele veio de um id_token verificado. */
export declare function credenciaisDoPedido(req: Request, segredo: string): Promise<Credenciais | null>;
export interface ConfigGoogle {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;
/** Monta o redirecionamento para o Google e o cookie curto com `state` e o verificador PKCE. */
export declare function iniciarLogin(cfg: ConfigGoogle, segredo: string, agora?: number): Promise<{
    url: string;
    cookie: string;
}>;
interface Jwk {
    kid: string;
    kty: string;
    n: string;
    e: string;
    alg?: string;
}
/** Confere assinatura RS256 e claims; devolve o e-mail verificado ou null. */
export declare function verificarIdToken(idToken: string, clientId: string, chaves: Jwk[], agora?: number): Promise<string | null>;
/**
 * Callback: confere `state`, troca o código pelo token e verifica o id_token.
 * Devolve o e-mail verificado, ou null em qualquer falha (quem falha cai no demo).
 */
export declare function concluirLogin(req: Request, cfg: ConfigGoogle, segredo: string, buscar?: Buscar): Promise<string | null>;
export {};
