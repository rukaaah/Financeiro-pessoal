/**
 * Roda uma vez antes dos testes de integração: dá ao papel `app` uma senha local para
 * os testes conectarem como ele. Uma vez só, porque dois ALTER ROLE ao mesmo tempo
 * dão "tuple concurrently updated". Vale só no Postgres descartável do Docker e do CI.
 *
 * Também garante um usuário demo que nenhum arquivo apaga: quem está fora da allowlist
 * cai nele, e os testes não podem depender da ordem em que os arquivos rodam.
 */
export default function (): Promise<void>;
