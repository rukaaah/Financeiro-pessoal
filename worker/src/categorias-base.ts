import { CATEGORIAS_BASE, GRUPOS_BASE } from "@financeiro/dominio";
import { type Consulta, consulta } from "./banco.ts";

/**
 * Cria os grupos e as categorias base para quem entra numa conta real sem nenhuma
 * categoria (ativa ou arquivada). Roda no lote do usuário, como papel `app` e sob a RLS:
 * `current_app_user()` é quem já foi fixado pelo `set_config` do começo do lote.
 *
 * Idempotente: quem já tem uma categoria não ganha nada, o demo nunca é tocado (o seed
 * cuida dele) e dois pedidos ao mesmo tempo não brigam, por causa do `on conflict`.
 * O `do update` sem efeito existe só para o `returning` trazer também o grupo que já
 * existia com o mesmo nome.
 */
const SQL = `
  with alvo as (
    select u.id from app_users u
     where u.id = current_app_user() and not u.is_demo
       and not exists (select 1 from categories)
  ),
  grupos as (
    insert into category_groups (user_id, name, sort_order)
    select alvo.id, g.nome, g.ordem
      from alvo, jsonb_to_recordset($1::jsonb) as g(nome text, ordem smallint)
    on conflict (user_id, name) do update set sort_order = category_groups.sort_order
    returning id, name
  )
  insert into categories (user_id, group_id, name, kind)
  select alvo.id, grupos.id, k.nome, k.tipo::category_kind
    from alvo, jsonb_to_recordset($2::jsonb) as k(grupo text, nome text, tipo text)
    join grupos on grupos.name = k.grupo
  on conflict (user_id, name) do nothing`;

export const criarCategoriasBase = (): Consulta =>
  consulta(SQL, JSON.stringify(GRUPOS_BASE), JSON.stringify(CATEGORIAS_BASE));
