import { useState } from "preact/hooks";
import { apiAtencao, brl, hoje, type ItemAtencao, type Mes, num, type Opcoes } from "../api.ts";
import { Icone } from "../icone.tsx";

const SELO = { critico: ["fora", "crítico"], atencao: ["perto", "atenção"], informativo: ["", "informativo"] } as const;
const ACAO: Record<string, string> = { "ver-categoria": "Ver", "pagar-conta": "Pagar", "pagar-fatura": "Pagar", receber: "Receber", "corrigir-cofrinho": "Corrigir", nenhuma: "" };
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const amanha = () => new Date(Date.parse(`${hoje()}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function ListaDeAtencao({ itens, limite, aoAgir, aoAdiar }: { itens: ItemAtencao[]; limite?: number; aoAgir(i: ItemAtencao): void; aoAdiar?(i: ItemAtencao, ate: string | null): void }) {
  const lista = limite ? itens.slice(0, limite) : itens;
  if (!lista.length) return <div class="vazio">Nada pendente agora.</div>;
  return (
    <div class="lista">{lista.map((i) => (
      <div class="item">
        <span class="nome">{SELO[i.gravidade][0] && <span class={`selo ${SELO[i.gravidade][0]}`}>{SELO[i.gravidade][1]}</span>}{i.titulo}</span>
        <span class="valor">{num(i.valor) !== 0 ? brl(i.valor) : ""}</span>
        <span class="sub">{i.detalhe}</span>
        {ACAO[i.acao.tipo] ? <button class="acao" onClick={() => aoAgir(i)}>{ACAO[i.acao.tipo]}</button> : <span />}
        {aoAdiar && i.acao.tipo !== "corrigir-cofrinho" && <span class="sub" style="grid-column:1/-1;display:flex;gap:16px;margin-top:4px">
          <button class="link-sub" onClick={() => aoAdiar(i, amanha())}>Lembrar amanhã</button>
          <button class="link-sub" onClick={() => aoAdiar(i, null)}>Resolvido</button>
        </span>}
      </div>
    ))}</div>
  );
}

export function Atencao({ dados, aoFechar, aoAgir, aoAdiar, aoNovaConta }: { dados: Mes; aoFechar(): void; aoAgir(i: ItemAtencao): void; aoAdiar(i: ItemAtencao, ate: string | null): void; aoNovaConta(): void }) {
  const aPagarTudo = dados.contas.filter((k) => !k.paga).reduce((s, k) => s + num(k.valor), 0) + dados.atencao.filter((i) => i.acao.tipo === "pagar-fatura").reduce((s, i) => s + num(i.valor), 0);
  const sobra = num(dados.saldo_hoje) - aPagarTudo;
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-at">
        <div class="topo"><h3 id="t-at">Atenção · {dados.atencao.length}</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <div class="rot sub">A pagar até o fim do mês</div>
        <div style="font-size:30px;font-weight:700;letter-spacing:-.02em">{brl(aPagarTudo.toFixed(2))}</div>
        <p class="sub" style={sobra < 0 ? "color:var(--fora);font-weight:700" : ""}>{sobra >= 0 ? `Sobram ${brl(sobra.toFixed(2))} em conta depois de pagar tudo.` : `Faltam ${brl((-sobra).toFixed(2))} em conta para pagar tudo.`}</p>
        <ListaDeAtencao itens={dados.atencao} aoAgir={aoAgir} aoAdiar={aoAdiar} />
        <div class="rodape"><button class="btn" onClick={aoNovaConta}><Icone nome="mais" tamanho={18} />Conta recorrente</button></div>
      </div>
    </div>
  );
}

export function SaldoProjetado({ dados }: { dados: Mes }) {
  const p = dados.projecao;
  if (p.length < 2) return null;
  const W = 330, H = 110, vals = p.map((x) => num(x.saldo)), mx = Math.max(...vals, 0), mn = Math.min(...vals, 0);
  const x = (i: number) => (i / (p.length - 1)) * (W - 8), y = (v: number) => 8 + ((mx - v) / (mx - mn || 1)) * (H - 24);
  const fim = p[p.length - 1]!, menor = p.reduce((m, q) => (num(q.saldo) < num(m.saldo) ? q : m));
  return (
    <section aria-labelledby="h-pr">
      <h2 id="h-pr">Saldo projetado <span class="lado">conta do dia a dia</span></h2>
      <div class="proj">
        <div class="fim"><span class="sub">em {dm(fim.dia)}, se o livre for todo gasto</span><b>{brl(fim.saldo)}</b></div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Saldo de ${brl(dados.saldo_hoje)} hoje até ${brl(fim.saldo)} em ${dm(fim.dia)}`}>
          {mn < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--fora)" stroke-dasharray="4 3" />}
          <polyline fill="none" stroke="var(--azul)" stroke-width="2.5" stroke-dasharray="5 4" points={p.map((q, i) => `${x(i).toFixed(1)},${y(num(q.saldo)).toFixed(1)}`).join(" ")} />
          <circle cx={x(0)} cy={y(vals[0]!)} r="4" fill="var(--tinta)" />
          <text x="0" y={H - 2} font-size="11" fill="var(--t2)">hoje</text>
          <text x={W - 8} y={H - 2} font-size="11" fill="var(--t2)" text-anchor="end">{dm(fim.dia)}</text>
        </svg>
        <p class="sub">{num(menor.saldo) < 0 ? `Fica negativo em ${dm(menor.dia)}: ${brl(menor.saldo)}.` : `Menor saldo: ${brl(menor.saldo)} em ${dm(menor.dia)}.`}
          {dados.entradas.length > 0 && ` Entradas previstas: ${dados.entradas.map((e) => `${e.descricao} em ${dm(e.data)}${num(e.estimativa) > 0 ? ` (≈ ${brl(e.estimativa)})` : " (sem PTAX)"}`).join(", ")}.`}</p>
      </div>
    </section>
  );
}

export function NovaConta({ opcoes, aoFechar, aoSalvar }: { opcoes: Opcoes | null; aoFechar(): void; aoSalvar(corpo: object): void }) {
  const cats = opcoes?.categorias.filter((c) => c.tipo === "expense") ?? [], contas = opcoes?.contas ?? [];
  const [nome, setNome] = useState(""), [valor, setValor] = useState(""), [dia, setDia] = useState(10);
  const [cat, setCat] = useState(cats[0]?.id ?? ""), [conta, setConta] = useState(contas[0]?.id ?? ""), [urg, setUrg] = useState("important");
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-nc">
        <div class="topo"><h3 id="t-nc">Conta recorrente</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); aoSalvar({ nome, valor, dia, categoria_id: cat || cats[0]?.id, conta_id: conta || contas[0]?.id, urgencia: urg }); }}>
          <div class="campo"><label for="nc-nome">Nome</label><input id="nc-nome" value={nome} placeholder="Conta de luz…" onInput={(e) => setNome(e.currentTarget.value)} /></div>
          <div class="campo"><label for="nc-val">Valor (R$)</label><input id="nc-val" inputMode="decimal" autoComplete="off" value={valor} placeholder="120,00…" onInput={(e) => setValor(e.currentTarget.value)} /></div>
          <div class="campo"><label for="nc-dia">Vence todo dia</label><input id="nc-dia" type="number" min={1} max={31} value={dia} onInput={(e) => setDia(Number(e.currentTarget.value))} /></div>
          <div class="campo"><label for="nc-cat">Categoria</label><select id="nc-cat" value={cat} onChange={(e) => setCat(e.currentTarget.value)}>{cats.map((c) => <option value={c.id}>{c.grupo} · {c.nome}</option>)}</select></div>
          <div class="campo"><label for="nc-conta">Paga com</label><select id="nc-conta" value={conta} onChange={(e) => setConta(e.currentTarget.value)}>{contas.map((c) => <option value={c.id}>{c.nome}</option>)}</select></div>
          <div class="chips" role="group" aria-label="Urgência">{[["essential", "Essencial"], ["important", "Importante"], ["deferrable", "Adiável"]].map(([v, r]) => <button type="button" class="chip" aria-pressed={urg === v} onClick={() => setUrg(v!)}>{r}</button>)}</div>
          <p class="nota">Já reduz o livre deste mês. Quando você lançar o pagamento pela Atenção, ela sai de "a pagar" e entra no gasto.</p>
          <div style="margin-top:12px"><button type="submit" class="btn-tinta">Salvar</button></div>
        </form>
      </div>
    </div>
  );
}

export function Receber({ entrada, ptax, descontoPb, aoFechar, aoSalvar }: { entrada: { id: string; descricao: string; estimativa: string }; ptax: string | null; descontoPb: number; aoFechar(): void; aoSalvar(recebido: string): void }) {
  const [recebido, setRecebido] = useState(brl(entrada.estimativa).replace("R$ ", ""));
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-rec">
        <div class="topo"><h3 id="t-rec">{entrada.descricao} chegou</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); aoSalvar(recebido); }}>
          <div class="campo"><label for="r-val">Chegou em reais (como o PayPal mostra)</label><input id="r-val" class="grande-in" inputMode="decimal" autoComplete="off" value={recebido} onInput={(e) => setRecebido(e.currentTarget.value)} /></div>
          <p class="nota">{ptax ? `PTAX de hoje ${ptax.replace(".", ",")}. A estimativa já descontava ${(descontoPb / 100).toFixed(1).replace(".", ",")}%, a média medida até agora.` : "Sem PTAX agora: o desconto do PayPal fica sem medir neste recebimento."} Ao salvar, o app mostra quanto o PayPal ficou.</p>
          <div style="margin-top:12px"><button type="submit" class="btn-tinta">Registrar recebimento</button></div>
        </form>
      </div>
    </div>
  );
}
