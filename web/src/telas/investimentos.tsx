import { useEffect, useState } from "preact/hooks";
import { apiInvest, brl, diaMes, type EventoFii, type GestaoFii, hoje, type MomentoFii, type Investimentos as Dados, type NoticiasFii, num, type Opcoes } from "../api.ts";
import { Icone } from "../icone.tsx";
import { Chat } from "./chat.tsx";

const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const FONTES: Record<string, string> = { b3: "fechamento da B3", brapi: "brapi, até 30 min de atraso", demo: "dados fictícios", investidor10: "Investidor10" };
const quando = (iso: string | null) => (iso ? `${diaMes(iso)}${iso.length > 10 ? ` às ${iso.slice(11, 16)}` : ""}` : "");
const EVENTO: Record<EventoFii["tipo"], string> = { data_com: "Data-com", pagamento: "Pagamento", subscricao: "Subscrição", assembleia: "Assembleia", outro: "Data" };
const FNET = "https://fnet.bmfbovespa.com.br/fnet/publico/exibirDocumento?id=";
const proximo = (n: NoticiasFii | undefined) => n?.eventos.find((e) => e.data >= hoje());
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
  const [conversa, setConversa] = useState<string | null>(null);
  const [noticias, setNoticias] = useState<Record<string, NoticiasFii>>({});
  const [momento, setMomento] = useState<MomentoFii | null>(null);
  const carregar = (aporte?: string) => {
    apiInvest.momento(aporte).then(setMomento).catch(() => setMomento(null));
    return apiInvest.ver(aporte).then(setD).catch((e: Error) => aoAvisar(e.message));
  };
  useEffect(() => {
    carregar();
    apiInvest.noticias().then((r) => setNoticias(Object.fromEntries(r.noticias.map((n) => [n.ticker, n])))).catch(() => {});
  }, []);
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
          {momento && momento.fundos.length > 0 && <Momento m={momento} />}
          {d.ativos.length > 0 && <Relatorio d={d} />}
          <section><h2>Aportes por mês <span class="lado">12 meses</span></h2><div class="graf"><Barras vals={d.series.map((x) => ({ mes: x.mes, v: num(x.aporte) }))} destacaUltimo rotulo="Aportes por mês" />
            <p class="sub">Você colocou {brl(d.series.reduce((s, x) => s + num(x.aporte), 0).toFixed(2))} em 12 meses. Comparação com CDI e IFIX entra com o job do CDI.</p></div></section>
          <section><h2>Alocação contra a meta</h2><div class="proj">{d.classes.map((k) => (
            <div class="aloc"><span>{k.nome}</span><span class="tr"><i style={`width:${k.peso}%`} />{k.meta != null && <b style={`left:${k.meta}%`} />}</span><span style="text-align:right">{Math.round(k.peso)}%</span></div>
          ))}<p class="sub">Barra: hoje. Traço: sua meta.</p></div></section>
        </>
      )}
      {d && face === "Carteira" && (
        <section><h2>Ativos</h2>
          {d.ativos.length === 0 && <div class="vazio">Nenhum ativo ainda. Toque em "Comprei" para registrar a primeira compra.</div>}
          {d.classes.filter((k) => num(k.valor) > 0).map((k) => (
            <div class="grupo"><div class="grupo-cab"><span>{k.nome}</span><span>{brl(k.valor)}</span></div>
              {d.ativos.filter((a) => a.classe === k.classe).map((a) => (
                <div class="cartao-fii">
                  <button type="button" class="item" aria-haspopup="dialog" onClick={() => setAberto(a.id)}><span class="nome">{a.ticker}</span><span class="valor">{brl(a.valor)}</span>
                    <span class="sub" style="grid-column:1/-1">{a.quantidade.toLocaleString("pt-BR")} cotas · PM {brl(a.preco_medio)}</span>
                    {(a.pvp != null || a.dy != null) && <span class="indicadores" style="grid-column:1/-1">{a.pvp != null && <span>P/VP <b>{a.pvp.toFixed(2).replace(".", ",")}</b></span>}{a.dy != null && <span>DY <b>{a.dy.toFixed(1).replace(".", ",")}%</b></span>}{a.vp_mes && <span>VP {a.vp_mes.slice(5)}/{a.vp_mes.slice(2, 4)}</span>}</span>}
                    <span class="indicadores" style="grid-column:1/-1">{a.variacao_dia != null && <span>hoje <b class={a.variacao_dia >= 0 ? "pos" : "neg"}>{pct(a.variacao_dia)}</b></span>}<span>mês <b class={(a.variacao_mes ?? 0) >= 0 ? "pos" : "neg"}>{pct(a.variacao_mes)}</b></span><span>no PM <b class={a.variacao_pm >= 0 ? "pos" : "neg"}>{pct(a.variacao_pm)}</b></span></span></button>
                  <LinhaDeNoticia n={noticias[a.ticker]} ticker={a.ticker} aoConversar={() => setConversa(a.ticker)} /></div>
              ))}</div>
          ))}
          <p class="sub">{d.relatorio.atualizado_em ? `Cotação de ${quando(d.relatorio.atualizado_em)} (${FONTES[d.relatorio.fonte ?? ""] ?? d.relatorio.fonte}). P/VP e DY calculados com o informe mensal da CVM.` : "Sem cotação ainda: o valor mostrado é o custo."}</p>
        </section>
      )}
      {d && face === "Proventos" && (
        <section><h2>Recebido por mês</h2><div class="graf"><Barras vals={d.series.map((x) => ({ mes: x.mes, v: num(x.proventos) }))} destacaUltimo rotulo="Proventos por mês" />
          <p class="sub">{brl(proventos12.toFixed(2))} em 12 meses. Proventos são as receitas lançadas na conta de investimento.</p></div></section>
      )}
      {aberto && d && (() => { const a = d.ativos.find((x) => x.id === aberto); return a ? <Detalhe a={a} d={d} n={noticias[a.ticker]} aoConversar={() => { setAberto(null); setConversa(a.ticker); }} aoFechar={() => setAberto(null)} /> : null; })()}
      {conversa && <Chat contexto="fundo" ticker={conversa} titulo={conversa} mes={hoje().slice(0, 7)} aoFechar={() => setConversa(null)} />}
      {folha === "aportar" && d && <OndeAportar d={d} aoFechar={() => setFolha(null)} aoRecalcular={(v) => carregar(v)} />}
      {folha === "comprar" && <Comprar opcoes={opcoes} aoFechar={() => setFolha(null)} aoSalvar={(corpo) => { setFolha(null); apiInvest.comprar(corpo).then(() => carregar()).then(() => aoAvisar("Compra registrada.")).catch((e: Error) => aoAvisar(e.message)); }} />}
    </>
  );
}

const VEREDITO: Record<MomentoFii["fundos"][number]["veredito"], string> = { grande_dia: "Um dos melhores dias do ano", bom_preco: "Bom preço", esperar: "Esperar", sem_dados: "Histórico curto" };
const TENDENCIA: Record<NonNullable<MomentoFii["panorama"]>["tendencia"], string> = { alta: "Em alta", queda: "Em queda", lateral: "De lado", sem_dados: "Sem histórico" };
const SELO: Record<string, string> = { grande_dia: "dentro", bom_preco: "dentro", esperar: "perto", sem_dados: "neutro" };

/** Medidor diário (ADR-022): tendência dos fundos acompanhados, Selic e o melhor fundo para hoje. */
function Momento({ m }: { m: MomentoFii }) {
  const p = m.panorama;
  const [top] = m.fundos;
  const comprar = top && (top.veredito === "grande_dia" || top.veredito === "bom_preco");
  const v1 = (x: number) => x.toFixed(1).replace(".", ",");
  return (
    <section class="momento">
      <h2>Momento de compra{top && <span class="lado">pregão de {diaMes(top.dia)}</span>}</h2>
      <div class="cartao-momento">
        {p && p.tendencia !== "sem_dados" && (
          <p class="mercado"><b>{TENDENCIA[p.tendencia]}</b>: {p.acima_da_media} de {p.fundos} fundos seus acima da média do mês{p.variacao_21 != null ? `, ${p.variacao_21 >= 0 ? "+" : ""}${v1(p.variacao_21)}% em 21 pregões (mediana)` : ""}.
            {p.selic && <> Selic {Number(p.selic).toFixed(2).replace(".", ",")}% ao ano, {p.direcao_selic}.</>}</p>
        )}
        {top && comprar ? (
          <div class="escolha">
            <div class="cab"><span class="ticker">{top.ticker}</span><span class={`selo ${SELO[top.veredito]}`}>{VEREDITO[top.veredito]}</span></div>
            <p class="motivo">{top.motivo}</p>
            {top.sugestao && (top.sugestao.cotas > 0
              ? <p class="sugestao">Com {brl(m.aporte)}: <b>{top.sugestao.cotas} {top.sugestao.cotas === 1 ? "cota" : "cotas"}</b> por {brl(top.sugestao.valor)}{top.sugestao.limite ? `, ${top.sugestao.limite}` : ""}.</p>
              : <p class="sugestao">Nenhuma cota com {brl(m.aporte)}{top.sugestao.limite ? `: ${top.sugestao.limite}` : ": o aporte não paga uma cota"}.</p>)}
            {top.previsao && <p class="previsao">{top.previsao}</p>}
            {top.riscos.length > 0 && <ul class="riscos">{top.riscos.map((r) => <li>{r}</li>)}</ul>}
          </div>
        ) : (
          <p class="motivo">Nenhum fundo da sua carteira está em ponto de compra hoje.{top?.nota != null ? ` O mais perto é ${top.ticker}, com nota ${top.nota} de 100.` : ""}</p>
        )}
        {m.fundos.length > 1 && (
          <details class="todos"><summary>Todos os fundos ({m.fundos.length})</summary>
            <div class="lista">{m.fundos.map((f) => (
              <div class="item"><span class="nome">{f.ticker}</span><span class="valor">{f.nota != null ? `nota ${f.nota}` : "—"}</span>
                <span class="sub" style="grid-column:1/-1">{f.veredito !== "esperar" && <span class={`selo ${SELO[f.veredito]}`}>{VEREDITO[f.veredito]}</span>}{f.motivo.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? f.motivo}</span></div>
            ))}</div>
          </details>
        )}
        <p class="nota">Nota de 0 a 100: P/VP e DY contra o próprio último ano, desconto sobre o patrimônio e preço contra a média do mês. {top?.com_ia ? "Texto da IA conferido contra esses números. " : ""}Tendência só dos seus fundos, não do IFIX. Não é recomendação de analista.</p>
      </div>
    </section>
  );
}

/** No card da carteira: a próxima data que pede atenção e a primeira frase do resumo. Tocar abre o chat do fundo. */
function LinhaDeNoticia({ n, ticker, aoConversar }: { n: NoticiasFii | undefined; ticker: string; aoConversar(): void }) {
  if (!n?.resumo) return null;
  const p = proximo(n);
  const frase = n.resumo.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? n.resumo;
  return (
    <button type="button" class="linha-ia" onClick={aoConversar} aria-label={`Conversar com a IA sobre ${ticker}: ${frase}`}>
      <Icone nome="ia" tamanho={16} />
      <span class="texto">{p && <b>{EVENTO[p.tipo]} {diaMes(p.data)}</b>}<span class="frase">{frase}</span></span>
      <Icone nome="abrir" tamanho={16} />
    </button>
  );
}

function Gestao({ g, datas }: { g: GestaoFii; datas: Record<string, string> }) {
  const quandoDoc = (id: number) => (datas[String(id)] ? diaMes(datas[String(id)]!) : "");
  return (
    <section class="gestao-fii">
      <h3 class="tit-secao">Gestão</h3>
      {g.postura && <p class="postura">{g.postura}</p>}
      {g.planos.length > 0 && <><h4>O que pretende</h4><ul class="preparar">{g.planos.map((p) => <li>{p.texto} <a href={FNET + p.documento} target="_blank" rel="noopener noreferrer" class="fonte">relatório de {quandoDoc(p.documento)}</a></li>)}</ul></>}
      {g.mudancas.length > 0 && <><h4>Mudou de ideia</h4>{g.mudancas.map((m) => (
        <div class="mudanca">
          <div class="tema">{m.tema}</div>
          <div class="antes"><span class="quando">{quandoDoc(m.documento_antes)}</span>{m.antes}</div>
          <div class="agora"><span class="quando">{quandoDoc(m.documento_agora)}</span>{m.agora}</div>
          <blockquote>“{m.trecho}” <a href={FNET + m.documento_agora} target="_blank" rel="noopener noreferrer" class="fonte">ver relatório</a></blockquote>
        </div>
      ))}</>}
    </section>
  );
}

function Noticias({ n, aoConversar }: { n: NoticiasFii | undefined; aoConversar(): void }) {
  if (!n || (!n.resumo && n.documentos.length === 0)) return <p class="nota">Sem comunicados do fundo nos últimos 90 dias.</p>;
  const proximas = n.eventos.filter((e) => e.data >= hoje());
  return (
    <section class="noticias-fii">
      <h2><span class="ia-tit"><Icone nome="ia" tamanho={18} />Notícias do fundo</span>{n.gerado_em && <span class="lado">{quando(n.gerado_em)}</span>}</h2>
      {n.resumo && <button type="button" class="msg ia resumo-ia" onClick={aoConversar}><span class="quem"><Icone nome="ia" tamanho={14} />Resumo da IA</span>{n.resumo}<span class="conversar">Conversar sobre isso<Icone nome="abrir" tamanho={16} /></span></button>}
      {n.gestao && <Gestao g={n.gestao} datas={n.gestao_datas ?? {}} />}
      {n.preparar.length > 0 && <><h3 class="tit-secao">Como se preparar</h3><ul class="preparar">{n.preparar.map((p) => <li>{p}</li>)}</ul></>}
      {proximas.length > 0 && <div class="lista">{proximas.map((e) => <div class="item"><span class="nome">{EVENTO[e.tipo]}</span><span class="valor">{diaMes(e.data)}</span><span class="sub" style="grid-column:1/-1">{e.texto}</span></div>)}</div>}
      {n.documentos.length > 0 && <div class="lista">{n.documentos.map((doc) => (
        <a class="item" href={FNET + doc.id} target="_blank" rel="noopener noreferrer"><span class="nome">{doc.titulo}</span><span class="sub">{diaMes(doc.entregue_em)}</span></a>
      ))}</div>}
      <p class="nota">Documentos oficiais do fundo no Fundos.NET (B3). Confira as datas no documento.</p>
    </section>
  );
}

function Detalhe({ a, d, n, aoConversar, aoFechar }: { a: Dados["ativos"][number]; d: Dados; n: NoticiasFii | undefined; aoConversar(): void; aoFechar(): void }) {
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
      <dl class="ficha">{kv.map(([r, v]) => <div><dt>{r}</dt><dd>{v}</dd></div>)}</dl>
      <p class="nota">{a.atualizado_em ? <>Dado de <b>{quando(a.atualizado_em)}</b>, fonte: {FONTES[a.fonte ?? ""] ?? a.fonte}.</> : "Ainda sem cotação: o valor é o custo."}{a.fonte === "demo" ? " No modo demonstração os números são inventados; entre com sua conta para ver dados reais." : ""}</p>
      <p class="nota">{fora ? `Fora do "Onde aportar": ${fora.motivo}.` : "Passa nas suas regras do \"Onde aportar\"."}</p>
      {a.classe !== "treasury" && <>
        <button class="btn-ia largo" onClick={aoConversar}><Icone nome="ia" tamanho={18} />Conversar com a IA sobre {a.ticker}</button>
        <Noticias n={n} aoConversar={aoConversar} />
      </>}
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
        <div class="campo"><label for="cp-t">Ativo</label><input id="cp-t" value={f.ticker} placeholder="MXRF11…" autoComplete="off" autocapitalize="characters" spellcheck={false} onInput={set("ticker")} /></div>
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
