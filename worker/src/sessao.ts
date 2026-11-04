import { type Credenciais, emailConfiavel, type Sessao, sessaoDe } from "@financeiro/dominio";
import { type Banco, type Consulta, consulta, type Linha } from "./banco.ts";

/**
 * As duas consultas que abrem todo lote: fixam o usuário da transação e carregam a
 * linha dele. `resolve_app_user` e `demo_app_user` são as funções SECURITY DEFINER da
 * migration 001, que rodam antes de haver contexto.
 */
export function abrirLote(credenciais: Credenciais | null): Consulta[] {
  const email = emailConfiavel(credenciais);
  return [
    consulta(
      "select set_config('app.user_id', coalesce(resolve_app_user($1), demo_app_user())::text, true)",
      email,
    ),
    consulta(
      `select resolve_app_user($1) is not null as na_allowlist, id, email, display_name, is_demo
         from app_users where id = current_app_user()`,
      email,
    ),
  ];
}

export function sessaoDoLote(linhas: Linha[] | undefined): Sessao {
  const l = linhas?.[0];
  return sessaoDe({
    naAllowlist: Boolean(l?.na_allowlist),
    usuario: l
      ? { id: String(l.id), email: String(l.email), nome: String(l.display_name), ehDemo: Boolean(l.is_demo) }
      : null,
  });
}

/** Roda as consultas de uma rota já com o usuário fixado; devolve a sessão e o resto. */
export async function comSessao(
  banco: Banco,
  credenciais: Credenciais | null,
  consultas: readonly Consulta[],
): Promise<{ sessao: Sessao; linhas: Linha[][] }> {
  const [, usuario, ...resto] = await banco.lote([...abrirLote(credenciais), ...consultas]);
  return { sessao: sessaoDoLote(usuario), linhas: resto };
}
