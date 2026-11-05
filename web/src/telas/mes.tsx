import { useEffect, useState } from "preact/hooks";
import { apiMes, brl, type CategoriaDoMes, type DetalheCategoria, type Mes as MesDados, num } from "../api.ts";
import { Icone } from "../icone.tsx";
import { ListaDeAtencao, SaldoProjetado } from "./atencao.tsx";
import type { ItemAtencao } from "../api.ts";

const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const FMT_MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
export const nomeDoMes = (m: string) => FMT_MES.format(new Date(`${m}-15T12:00:00Z`)).replace(/^./, (c) => c.toUpperCase());
export const andarMes = (m: string, d: number) => { const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + d; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const pct = (a: string, b: string) => (num(b) > 0 ? Math.round((num(a) / num(b)) * 100) : 0);
const semRS = (t: string) => brl(t).replace("R$ ", "");

export function Mes({ mes, dados, aoTrocarMes, aoAbrirCategoria, aoVerAtencao, aoAgir, aoPerguntar }: { mes: string; dados: MesDados | null; aoTrocarMes(m: string): void; aoAbrirCategoria(c: CategoriaDoMes): void; aoVerAtencao(): void; aoAgir(i: ItemAtencao): void; aoPerguntar(): void }) {
  const d = dados;
  const grupos = [...new Set(d?.categorias.map((c) => c.grupo) ?? [])];
  return (
    <>
      <header><div><h1>Mês</h1>
        <div class="mes"><button aria-label="Mês anterior" onClick={() => aoTrocarMes(andarMes(mes, -1))}>‹</button>{nomeDoMes(mes)}<button aria-label="Próximo mês" onClick={() => aoTrocarMes(andarMes(mes, 1))}>›</button></div>
      </div></header>

      <div class="grade-desk"><div class="col">
      <div class="heroi" aria-busy={!d}>
        <div class="rot">Livre para gastar até {d ? `${d.dias_no_mes}/${mes.slice(5, 7)}` : "o fim do mês"}</div>
        <div class="grande">{d ? brl(d.livre) : <span class="esqueleto" />}</div>
        <p class="conta">{d ? (d.dias_restantes > 0 && num(d.livre) > 0 ? `${brl(d.por_dia)} por dia nos ${d.dias_restantes} dias · ` : "") + "previsto − gasto − a pagar" : " "}</p>
        <div class="trilho" role="img" aria-label={d ? `Gasto ${pct(d.gasto, d.previsto)}% do previsto` : "Carregando"}>
          {d && <><i style={`width:${Math.min(100, pct(d.gasto, d.previsto))}%;background:var(--heroi-t)`} /><i style={`width:${Math.max(0, Math.min(100 - pct(d.gasto, d.previsto), pct(d.a_pagar, d.previsto)))}%;background:var(--azul-claro)`} /></>}
        </div>
        <div class="tres">
          <div><div class="r">Previsto</div><div class="v">{d ? semRS(d.previsto) : "—"}</div></div>
          <div><div class="r"><span class="dot" style="background:var(--heroi-t)" />Gasto</div><div class="v">{d ? semRS(d.gasto) : "—"}</div></div>
          <div><div class="r"><span class="dot" style="background:var(--azul-claro)" />A pagar</div><div class="v">{d ? semRS(d.a_pagar) : "—"}</div></div>
        </div>
        {d && <div class="pe"><span>{pct(d.gasto, d.previsto)}% gasto · dia {d.dia_do_mes} de {d.dias_no_mes}</span><button class="btn-claro" onClick={aoPerguntar}>Perguntar</button></div>}
      </div>

      {d?.descoberta && <div class="achado" role="note"><span aria-hidden="true">!</span><div>{d.descoberta}</div></div>}

      {d && (
        <section aria-labelledby="h-at">
          <h2 id="h-at">Atenção · {d.atencao.length} <button class="link-sub" onClick={aoVerAtencao}>Ver todos</button></h2>
          <ListaDeAtencao itens={d.atencao} limite={3} aoAgir={aoAgir} />
        </section>
      )}
      {d && <SaldoProjetado dados={d} />}
      </div><div class="col">

      <section aria-labelledby="h-cat">
        <h2 id="h-cat">Categorias <span class="lado">gasto · previsto</span></h2>
        {!d ? <div class="grupo"><div class="item"><span class="esqueleto" /><span class="esqueleto" style="width:4em" /></div></div>
          : d.categorias.length === 0 ? <div class="vazio"><b>Nenhuma categoria ainda.</b><p class="sub">As categorias e o previsto ficam em Ajustes, que chega na fatia 10.</p></div>
          : grupos.map((g) => {
            const cs = d.categorias.filter((c) => c.grupo === g);
            const tg = cs.reduce((s, c) => s + num(c.gasto), 0), tp = cs.reduce((s, c) => s + num(c.previsto), 0);
            return (
              <div class="grupo">
                <div class="grupo-cab"><span>{g}</span><span>{brl(tg.toFixed(2))} de {brl(tp.toFixed(2))}</span></div>
                {cs.map((c) => {
                  const dif = num(c.gasto) - num(c.media3m);
                  return (
                    <button class={`item cat ${c.estado === "dentro" ? "" : c.estado}`} onClick={() => aoAbrirCategoria(c)}>
                      <span class="nome">{c.estado !== "dentro" && <span class={`selo ${c.estado}`}>{c.estado}</span>}{c.nome}</span>
                      <span class="valor">{brl(c.gasto)}</span>
                      <span class="sub">de {brl(c.previsto)}{c.ajustado ? " (ajustado)" : ""}{num(c.media3m) > 0 ? ` · ${brl(Math.abs(dif).toFixed(2))} ${dif >= 0 ? "acima" : "abaixo"} da média` : ""}</span>
                      <span class="sub">{num(c.previsto) > 0 ? `${pct(c.gasto, c.previsto)}%` : "—"}</span>
                      <span class="barra"><i style={`width:${Math.min(100, pct(c.gasto, c.previsto))}%`} /></span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        {d && d.categorias.length > 0 && <div class="linha-total"><span>Total</span><span>{brl(d.gasto)} de {brl(d.previsto)}</span></div>}
        <p class="sub">Compra no cartão conta no mês de vencimento da fatura. Toque numa categoria para ver o histórico e ajustar o previsto.</p>
      </section>

      {d && (
        <section aria-labelledby="h-gu">
          <h2 id="h-gu">Guardado e sobra</h2>
          <div class="lista">
            <div class="item"><span class="nome">Renda</span><span class="valor">{brl(d.renda)}</span><span class="sub">prevista {brl(d.renda_prevista)}</span><span /></div>
            <div class="item"><span class="nome">Guardado no mês</span><span class="valor">{brl(d.guardado)}</span><span class="sub">em cofrinhos e investimentos</span><span /></div>
          </div>
          <div class="linha-total"><span>Sobra do mês</span><span>{brl(d.sobra)}</span></div>
          <p class="sub">Renda − gasto − guardado.</p>
        </section>
      )}
      </div></div>
    </>
  );
}

export function DetalheDaCategoria({ c, mes, aoFechar, aoSalvar, aoPerguntar }: { c: CategoriaDoMes; mes: string; aoFechar(): void; aoSalvar(valor: string, padrao: boolean): void; aoPerguntar(): void }) {
  const [det, setDet] = useState<DetalheCategoria | null>(null);
  const [valor, setValor] = useState(semRS(c.previsto));
  const [padrao, setPadrao] = useState(false);
  useEffect(() => { apiMes.categoria(c.id, mes).then(setDet).catch(() => {}); }, [c.id, mes]);
  const mx = Math.max(1, ...(det?.serie ?? []).map((s) => Math.max(num(s.gasto), num(s.previsto ?? "0"))));
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-cat">
        <div class="topo"><h3 id="t-cat">{c.nome}</h3><button class="btn" onClick={aoPerguntar}>Perguntar</button><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <div style="font-size:30px;font-weight:700;letter-spacing:-.02em">{brl(c.gasto)}</div>
        <div class="sub">{c.estado !== "dentro" && <span class={`selo ${c.estado}`}>{c.estado}</span>}de {brl(c.previsto)} previstos · média de 3 meses {brl(c.media3m)}</div>
        <div class="colunas" role="img" aria-label="Gasto nos últimos 12 meses">
          {(det?.serie ?? []).map((s, i, arr) => <i class={i === arr.length - 1 ? "atual" : ""} title={`${s.mes}: ${brl(s.gasto)}`} style={`height:${Math.max(2, (num(s.gasto) / mx) * 100)}%`} />)}
        </div>
        <div class="colunas-rot"><span>{det?.serie[0] ? `${CURTOS[Number(det.serie[0].mes.slice(5)) - 1]}/${det.serie[0].mes.slice(2, 4)}` : ""}</span><span>{nomeDoMes(mes)}</span></div>
        <form onSubmit={(e) => { e.preventDefault(); aoSalvar(valor, padrao); }}>
          <div class="campo"><label for="p-val">Previsto (R$)</label><input id="p-val" inputMode="decimal" autoComplete="off" value={valor} onInput={(e) => setValor(e.currentTarget.value)} /></div>
          <div class="chips" role="group" aria-label="Vale para">
            <button type="button" class="chip" aria-pressed={!padrao} onClick={() => setPadrao(false)}>Só {nomeDoMes(mes).split(" ")[0]?.toLowerCase()}</button>
            <button type="button" class="chip" aria-pressed={padrao} onClick={() => setPadrao(true)}>Daqui em diante</button>
          </div>
          <p class="nota">{padrao ? "Muda o padrão a partir deste mês. Os meses anteriores continuam como estavam." : "Vale só para este mês; o padrão continua o mesmo."}</p>
          <div style="margin-top:12px"><button type="submit" class="btn-tinta">Salvar previsto</button></div>
        </form>
        {det && det.lancamentos.length > 0 && (
          <section><h2>Lançamentos do mês</h2><div class="lista">{det.lancamentos.map((l) => (
            <div class="item"><span class="nome">{l.descricao || c.nome}</span><span class="valor">{brl(l.valor)}</span><span class="sub">{l.data.slice(8, 10)}/{l.data.slice(5, 7)} · {l.conta}</span><span /></div>
          ))}</div></section>
        )}
      </div>
    </div>
  );
}
