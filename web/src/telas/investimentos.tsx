import { useEffect, useState } from "preact/hooks";
import { apiInvest, brl, hoje, type Investimentos as Dados, num, type Opcoes } from "../api.ts";
import { Icone } from "../icone.tsx";

const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const FONTES: Record<string, string> = { b3: "fechamento da B3", brapi: "brapi, até 30 min de atraso", demo: "dados fictícios", investidor10: "Investidor10" };
const quando = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}${iso.length > 10 ? ` às ${iso.slice(11, 16)}` : ""}` : "");
const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")}%`);

function Barras({ vals, destacaUltimo, rotulo }: { vals: { mes: string; v: number }[]; destacaUltimo?: boolean; rotulo: string }) {
  const mx = Math.max(1, ...vals.map((x) => x.v)), W = 330, H = 120, bw = (W - 10) / vals.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={rotulo}>
      {vals.map((x, i) => <rect x={5 + i * bw + bw * 0.15} y={H - 18 - (x.v / mx) * (H - 30)} width={bw * 0.7} height={(x.v / mx) * (H - 30)} fill={destacaUltimo && i === vals.length - 1 ? "var(--azul)" : "var(--t2)"} />)}
      {[0, Math.floor(vals.length / 2), vals.length - 1].map((i) => vals[i] && <text x={5 + i * bw + bw / 2} y={H - 4} font-size="11" fill="var(--t2)" text-anchor="middle">{CURTOS[Number(vals[i]!.mes.slice(5)) - 1]}</text>)}
    </svg>
  );
}

export function Investimentos({ opcoes, aoAvisar, aoPerguntar }: { opcoes: Opcoes | null; aoAvisar(t: string): void; aoPerguntar(): void }) {
  const [d, setD] = useState<Dados | null>(null);
  const [face, setFace] = useState<"Resumo" | "Carteira" | "Proventos">("Resumo");
  const [folha, setFolha] = useState<null | "comprar" | "aportar">(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const carregar = (aporte?: string) => apiInvest.ver(aporte).then(setD).catch((e: Error) => aoAvisar(e.message));
  useEffect(() => { carregar(); }, []);
  const proventos12 = d?.series.reduce((s, x) => s + num(x.proventos), 0) ?? 0;
  return (
    <>
      <div class="heroi" aria-busy={!d}>
        <div class="rot">Investido hoje</div>
        <div class="grande">{d ? brl(d.total) : <span class="esqueleto" />}</div>
        <p class="conta">{d ? `${brl(d.variacao_mes, true)} no mês pela cotação · custo ${brl(d.custo)}` : " "}</p>
        {d && <div class="tres"><div><div class="r">Proventos 12m</div><div class="v">{brl(proventos12.toFixed(2)).replace("R$ ", "")}</div></div><div><div class="r">Média/mês</div><div class="v">{brl((proventos12 / 12).toFixed(2)).replace("R$ ", "")}</div></div><div><div class="r">Rendeu</div><div class="v">{brl((num(d.total) - num(d.custo)).toFixed(2)).replace("R$ ", "")}</div></div></div>}
        <div class="acao-heroi">
          <button class="btn-cheio" onClick={() => setFolha("aportar")}><Icone nome="aportar" tamanho={16} />Onde aportar</button>
          <button class="btn-claro" onClick={() => setFolha("comprar")}><Icone nome="comprar" tamanho={16} />Comprei</button>
          <button class="btn-ia" onClick={aoPerguntar}><Icone nome="ia" tamanho={18} />Perguntar à IA sobre a carteira</button>
        </div>
      </div>
      <div class="seg" role="group" aria-label="Investimentos">{(["Resumo", "Carteira", "Proventos"] as const).map((f) => <button aria-pressed={f === face} onClick={() => setFace(f)}>{f}</button>)}</div>
      {d && face === "Resumo" && (
        <>
          {d.ativos.length > 0 && <Relatorio d={d} />}
          <section><h2>Aportes por mês <span class="lado">12 meses</span></h2><div class="graf"><Barras vals={d.series.map((x) => ({ mes: x.mes, v: num(x.aporte) }))} destacaUltimo rotulo="Aportes por mês" />
            <p class="sub">Você colocou {brl(d.series.reduce((s, x) => s + num(x.aporte), 0).toFixed(2))} em 12 meses. Comparação com CDI e IFIX entra com o job do CDI.</p></div></section>
          <section><h2>Alocação contra a meta</h2><div class="proj">{d.classes.map((k) => (
            <div class="aloc"><span>{k.nome}</span><span class="tr"><i style={`width:${k.peso}%`} />{k.meta != null && <b style={`left:${k.meta}%`} />}</span><span style="text-align:right">{Math.round(k.peso)}%</span></div>
          ))}<p class="sub">Barra: hoje. Traço: sua meta.</p></div></section>
        </>
      )}
      {d && face === "Carteira" && (
        <section><h2>Ativos <span class="lado">hoje · no mês · sobre o preço médio</span></h2>
          {d.ativos.length === 0 && <div class="vazio">Nenhum ativo ainda. Toque em "Comprei" para registrar a primeira compra.</div>}
          {d.classes.filter((k) => num(k.valor) > 0).map((k) => (
            <div class="grupo"><div class="grupo-cab"><span>{k.nome}</span><span>{brl(k.valor)}</span></div>
              {d.ativos.filter((a) => a.classe === k.classe).map((a) => (
                <button type="button" class="item" aria-haspopup="dialog" onClick={() => setAberto(a.id)}><span class="nome">{a.ticker}</span><span class="valor">{brl(a.valor)}</span>
                  <span class="sub" style="grid-column:1/-1">{a.quantidade.toLocaleString("pt-BR")} cotas · PM {brl(a.preco_medio)}{a.pvp != null ? ` · P/VP ${a.pvp.toFixed(2).replace(".", ",")}` : ""}{a.dy != null ? ` · DY ${a.dy.toFixed(1).replace(".", ",")}%` : ""}{a.vp_mes ? ` · VP de ${a.vp_mes.slice(5)}/${a.vp_mes.slice(2, 4)}` : ""}</span>
                  <span class={`sub ${a.variacao_pm >= 0 ? "pos" : "neg"}`} style="grid-column:1/-1">{a.variacao_dia != null ? `${pct(a.variacao_dia)} hoje · ` : ""}{pct(a.variacao_mes)} · {pct(a.variacao_pm)}</span></button>
              ))}</div>
          ))}
          <p class="sub">{d.relatorio.atualizado_em ? `Cotação de ${quando(d.relatorio.atualizado_em)} (${FONTES[d.relatorio.fonte ?? ""] ?? d.relatorio.fonte}). P/VP e DY calculados com o informe mensal da CVM.` : "Sem cotação ainda: o valor mostrado é o custo."}</p>
        </section>
      )}
      {d && face === "Proventos" && (
        <section><h2>Recebido por mês</h2><div class="graf"><Barras vals={d.series.map((x) => ({ mes: x.mes, v: num(x.proventos) }))} destacaUltimo rotulo="Proventos por mês" />
          <p class="sub">{brl(proventos12.toFixed(2))} em 12 meses. Proventos são as receitas lançadas na conta de investimento.</p></div></section>
      )}
      {aberto && d && (() => { const a = d.ativos.find((x) => x.id === aberto); return a ? <Detalhe a={a} d={d} aoFechar={() => setAberto(null)} /> : null; })()}
      {folha === "aportar" && d && <OndeAportar d={d} aoFechar={() => setFolha(null)} aoRecalcular={(v) => carregar(v)} />}
      {folha === "comprar" && <Comprar opcoes={opcoes} aoFechar={() => setFolha(null)} aoSalvar={(corpo) => { setFolha(null); apiInvest.comprar(corpo).then(() => carregar()).then(() => aoAvisar("Compra registrada.")).catch((e: Error) => aoAvisar(e.message)); }} />}
    </>
  );
}

function Detalhe({ a, d, aoFechar }: { a: Dados["ativos"][number]; d: Dados; aoFechar(): void }) {
  const v2 = (x: number | null, casas = 2) => (x == null ? "—" : x.toFixed(casas).replace(".", ","));
  const fora = d.onde_aportar.fora.find((f) => f.ticker === a.ticker);
  const kv: [string, string][] = [
    ["Cotas", a.quantidade.toLocaleString("pt-BR")], ["Preço médio", brl(a.preco_medio)],
    ["Preço", a.preco ? brl(Number(a.preco).toFixed(2)) : "sem cotação"], ["Valor", brl(a.valor)],
    ["Resultado", `${brl((num(a.valor) - num(a.custo)).toFixed(2), true)} (${pct(a.variacao_pm)})`], ["Peso na carteira", `${v2(a.peso, 1)}%`],
    ["Hoje", pct(a.variacao_dia)], ["30 dias", pct(a.variacao_30d)],
    ["P/VP", v2(a.pvp)], ["VP da cota", a.vp_cota != null ? `${brl(a.vp_cota.toFixed(2))}${a.vp_mes ? ` (${a.vp_mes.slice(5)}/${a.vp_mes.slice(2, 4)})` : ""}` : "—"],
    ["DY 12 meses", a.dy != null ? `${v2(a.dy, 1)}%` : "—"], ["Liquidez média", a.liquidez != null ? `R$ ${Math.round(a.liquidez / 1000).toLocaleString("pt-BR")} mil/dia` : "—"],
  ];
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}><div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-at">
      <div class="topo"><h3 id="t-at">{a.ticker}</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
      <p class="nota">{a.nome} · {a.classe_nome}</p>
      <div class="kv">{kv.map(([r, v]) => <div><div class="r">{r}</div><div class="v">{v}</div></div>)}</div>
      <p class="nota">{a.atualizado_em ? <>Dado de <b>{quando(a.atualizado_em)}</b>, fonte: {FONTES[a.fonte ?? ""] ?? a.fonte}.</> : "Ainda sem cotação: o valor é o custo."}{a.fonte === "demo" ? " No modo demonstração os números são inventados; entre com sua conta para ver dados reais." : ""}</p>
      <p class="nota">{fora ? `Fora do "Onde aportar": ${fora.motivo}.` : "Passa nas suas regras do \"Onde aportar\"."}</p>
    </div></div>
  );
}

function Relatorio({ d }: { d: Dados }) {
  const r = d.relatorio;
  const ordem = [...d.ativos].filter((a) => a.variacao_dia != null).sort((x, y) => (y.variacao_dia ?? 0) - (x.variacao_dia ?? 0));
  const melhor = ordem[0], pior = ordem[ordem.length - 1];
  return (
    <section><h2>Relatório <span class="lado">{r.atualizado_em ? quando(r.atualizado_em) : "sem cotação"}</span></h2><div class="lista">
      {r.desatualizado && <div class="item"><span class="nome neg">Cotação parada</span><span /><span class="sub" style="grid-column:1/-1">A mais nova é de {quando(r.desatualizado)}. A atualização automática pode ter falhado.</span></div>}
      <div class="item"><span class="nome">Renda estimada</span><span class="valor">{brl(r.renda_mensal)}/mês</span><span class="sub" style="grid-column:1/-1">Pelo DY dos últimos 12 meses sobre o valor de hoje. Não é promessa de rendimento.</span></div>
      {melhor && pior && melhor !== pior && <div class="item"><span class="nome">No dia</span><span class="valor" /><span class="sub" style="grid-column:1/-1">Maior alta {melhor.ticker} ({pct(melhor.variacao_dia)}), maior queda {pior.ticker} ({pct(pior.variacao_dia)}).</span></div>}
      {r.alertas.map((a) => <div class="item"><span class={`nome ${a.tipo === "oportunidade" ? "pos" : "neg"}`}>{a.ticker}</span><span /><span class="sub" style="grid-column:1/-1">{a.texto}</span></div>)}
      {r.alertas.length === 0 && <div class="item"><span class="sub" style="grid-column:1/-1">Nenhum ativo fora das suas regras.</span></div>}
    </div></section>
  );
}

function OndeAportar({ d, aoFechar, aoRecalcular }: { d: Dados; aoFechar(): void; aoRecalcular(v: string): void }) {
  const [valor, setValor] = useState(brl(d.onde_aportar.aporte).replace("R$ ", ""));
  const o = d.onde_aportar;
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}><div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-oa">
      <div class="topo"><h3 id="t-oa">Onde aportar</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
      <form onSubmit={(e) => { e.preventDefault(); aoRecalcular(valor); }}>
        <div class="campo"><label for="oa-v">Quanto vai aportar (R$)</label><input id="oa-v" class="grande-in" inputMode="decimal" autoComplete="off" value={valor} onInput={(e) => setValor(e.currentTarget.value)} /></div>
        <div class="rodape" style="margin-top:8px"><button class="btn" type="submit"><Icone nome="recalcular" tamanho={18} />Recalcular</button></div>
      </form>
      {o.avisos.length > 0 && <div class="lista" role="status">{o.avisos.map((t) => <div class="item"><span class="sub" style="grid-column:1/-1">{t}</span></div>)}</div>}
      <section><h2>Distribuição <span class="lado">{brl(o.aporte)}</span></h2><div class="lista">
        {o.sugestoes.map((s) => <div class="item"><span class="nome">{s.ticker}</span><span class="valor">{brl(s.valor)}</span><span class="sub">{s.motivo}</span><span class="sub">{s.cotas != null ? `${s.cotas} cotas` : ""}</span></div>)}
        {num(o.sobra) > 0 && <div class="item"><span class="nome">Sobra</span><span class="valor">{brl(o.sobra)}</span><span class="sub">Não fechou cota inteira.</span><span /></div>}
      </div></section>
      {o.fora.length > 0 && <section><h2>Ficaram de fora</h2><div class="lista">{o.fora.map((f) => <div class="item"><span class="nome">{f.ticker}</span><span /><span class="sub">{f.motivo}</span><span /></div>)}</div></section>}
      <p class="aviso">Sugestão pelas suas regras (metas por classe, P/VP até {d.regras.maxPvp.toFixed(2).replace(".", ",")}, peso até {d.regras.maxPeso}%, liquidez mínima). Não é recomendação de analista.</p>
    </div></div>
  );
}

function Comprar({ opcoes, aoFechar, aoSalvar }: { opcoes: Opcoes | null; aoFechar(): void; aoSalvar(corpo: object): void }) {
  const origens = opcoes?.contas.filter((c) => c.tipo !== "credit_card") ?? [];
  const [f, setF] = useState({ ticker: "", classe: "paper", quantidade: "", preco: "", conta_id: origens[0]?.id ?? "", investimento_id: opcoes?.investimentos?.[0]?.id ?? "", data: hoje() });
  const set = (k: string) => (e: Event) => setF({ ...f, [k]: (e.currentTarget as HTMLInputElement).value });
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}><div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-cp">
      <div class="topo"><h3 id="t-cp">Comprei um ativo</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
      <form onSubmit={(e) => { e.preventDefault(); aoSalvar(f); }}>
        <div class="campo"><label for="cp-t">Ativo</label><input id="cp-t" value={f.ticker} placeholder="MXRF11…" onInput={set("ticker")} /></div>
        <div class="campo"><label for="cp-c">Classe</label><select id="cp-c" value={f.classe} onChange={set("classe")}>{[["paper", "Papel"], ["brick", "Tijolo"], ["logistics", "Logística"], ["infra", "FI-Infra"], ["treasury", "Tesouro"], ["other", "Outros"]].map(([v, r]) => <option value={v}>{r}</option>)}</select></div>
        <div class="kv"><div class="campo" style="margin:0;background:none;padding:0"><label for="cp-q">Quantidade</label><input id="cp-q" inputMode="decimal" autoComplete="off" value={f.quantidade} onInput={set("quantidade")} /></div><div class="campo" style="margin:0;background:none;padding:0"><label for="cp-p">Preço por cota (R$)</label><input id="cp-p" inputMode="decimal" autoComplete="off" value={f.preco} onInput={set("preco")} /></div></div>
        <div class="campo"><label for="cp-o">Saiu de</label><select id="cp-o" value={f.conta_id} onChange={set("conta_id")}>{origens.map((c) => <option value={c.id}>{c.nome}</option>)}</select></div>
        <div class="campo"><label for="cp-i">Entrou em</label>{opcoes?.investimentos?.length ? <select id="cp-i" value={f.investimento_id} onChange={set("investimento_id")}>{opcoes.investimentos.map((c) => <option value={c.id}>{c.nome}</option>)}</select> : <p class="nota">Cadastre uma conta de investimento em Ajustes (fatia 10).</p>}</div>
        <p class="nota">É transferência, não gasto: o dinheiro sai da conta e entra na carteira.</p>
        <div style="margin-top:12px"><button type="submit" class="btn-tinta"><Icone nome="comprar" tamanho={18} />Registrar compra</button></div>
      </form>
    </div></div>
  );
}
