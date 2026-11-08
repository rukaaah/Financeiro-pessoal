import { useEffect, useState } from "preact/hooks";
import { type Ajustes as Dados, apiAjustes, brl, hoje } from "../api.ts";
import { Icone } from "../icone.tsx";

type Area = "Contas" | "Cartões" | "Categorias e previsto" | "Recorrentes" | "Investimentos" | "Regras" | "Acesso";
const ICONE_AREA: Partial<Record<Area, string>> = { Contas: "contas", "Cartões": "cartao", Investimentos: "investimentos", "Categorias e previsto": "mes", Recorrentes: "lancamentos", Regras: "ajustes", Acesso: "receber" };
const TIPOS: Record<string, string> = { checking: "corrente", credit_card: "cartão", goal: "cofrinho", investment: "investimento", cash: "dinheiro" };
const CLASSES: [string, string][] = [["paper", "Papel"], ["brick", "Tijolo"], ["logistics", "Logística"], ["infra", "FI-Infra"], ["treasury", "Tesouro"], ["other", "Outros"]];

/** Ajustes (06b-telas.md): lista de áreas; cada uma abre sua tela, com um Salvar por formulário. */
export function Ajustes({ demo, nome, aoAvisar, aoVoltar }: { demo: boolean; nome: string; aoAvisar(t: string): void; aoVoltar(): void }) {
  const [d, setD] = useState<Dados | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const carregar = () => apiAjustes.ver().then(setD).catch((e: Error) => aoAvisar(e.message));
  useEffect(() => { carregar(); }, []);
  const feito = (p: Promise<unknown>, msg = "Salvo.") => p.then(carregar).then(() => aoAvisar(msg)).catch((e: Error) => aoAvisar(e.message));
  const areas: [Area, string][] = [["Contas", `${d?.contas.filter((c) => c.ativa).length ?? "…"} ativas`], ["Cartões", d?.prazos.map((p) => `${p.nome}: fecha ${p.fechamento}, vence ${p.vencimento}`).join(" · ") || "—"], ["Categorias e previsto", `${d?.categorias.filter((c) => c.ativa).length ?? "…"} categorias`], ["Recorrentes", `${d?.recorrentes.length ?? "…"} contas`], ["Investimentos", "metas por classe e critérios"], ["Regras", `${d?.regras.length ?? "…"} regras de categoria`], ...(d?.admin ? [["Acesso", "quem pode entrar"] as [Area, string]] : [])];
  return (
    <>
      <header><div><h1>{area ?? "Ajustes"}</h1><div class="sub">{nome} · {demo ? "modo demonstração" : "modo real"}</div></div><button class="icone" aria-label="Voltar" onClick={() => (area ? setArea(null) : aoVoltar())}><Icone nome="fechar" /></button></header>
      {!area && d && (
        <>
          <div class="lista">{areas.map(([a, sub]) => <button class="item" onClick={() => setArea(a)}><span class="nome com-icone">{ICONE_AREA[a] && <Icone nome={ICONE_AREA[a]} tamanho={18} />}{a}</span><span class="sub">›</span><span class="sub">{sub}</span><span /></button>)}</div>
          <section><h2><span class="ia-tit"><Icone nome="ia" tamanho={20} />IA</span> <span class="lado">Cloudflare Workers AI</span></h2><div class="lista">
            <div class="item"><span class="nome">Chat por contexto</span><span class="sub">ligado</span><span class="sub">Envia: lançamentos do período, com nomes de pessoas trocados e números de conta apagados</span><span /></div>
            <div class="item"><span class="nome">Colar notificação (reserva)</span><span class="sub">ligado</span><span class="sub">Envia: o texto colado, sem números de conta</span><span /></div>
          </div><p class="sub">Nunca é enviado: nome de banco, número de conta ou cartão, CPF, e-mail. No modo demonstração a IA não é chamada.</p></section>
          {!demo && <div class="rodape"><a class="btn" href="/auth/sair"><Icone nome="sair" tamanho={18} />Sair</a></div>}
        </>
      )}
      {area === "Contas" && d && <Contas d={d} feito={feito} />}
      {area === "Cartões" && d && <Cartoes d={d} feito={feito} />}
      {area === "Categorias e previsto" && d && <Categorias d={d} feito={feito} />}
      {area === "Recorrentes" && d && <Recorrentes d={d} feito={feito} />}
      {area === "Investimentos" && d && <Investimento d={d} feito={feito} />}
      {area === "Regras" && d && <Regras d={d} feito={feito} />}
      {area === "Acesso" && <Acesso aoAvisar={aoAvisar} />}
    </>
  );
}

type P = { d: Dados; feito(p: Promise<unknown>, msg?: string): void };
const Campo = ({ id, rot, ...r }: { id: string; rot: string; value: string | number; onInput(e: Event): void; type?: string; inputMode?: string; autoComplete?: string }) => (
  <div class="campo"><label for={id}>{rot}</label><input id={id} {...(r as object)} /></div>
);
const valor = (e: Event) => (e.currentTarget as HTMLInputElement).value;

function Contas({ d, feito }: P) {
  const [nome, setNome] = useState(""), [tipo, setTipo] = useState("checking");
  return (<>
    <div class="lista">{d.contas.map((c) => <div class="item"><span class="nome">{c.nome}</span><span class="sub">{TIPOS[c.tipo] ?? c.tipo}</span><span class="sub">{c.ativa ? "ativa" : "arquivada"}</span><button class="link-sub" onClick={() => feito(apiAjustes.conta(c.id, { ativa: !c.ativa }))}>{c.ativa ? "Arquivar" : "Reativar"}</button></div>)}</div>
    <form onSubmit={(e) => { e.preventDefault(); feito(apiAjustes.novaConta({ nome, tipo }), "Conta criada."); setNome(""); }}>
      <Campo id="a-cn" rot="Nova conta" value={nome} onInput={(e) => setNome(valor(e))} />
      <div class="chips">{Object.entries(TIPOS).map(([v, r]) => <button type="button" class="chip" aria-pressed={tipo === v} onClick={() => setTipo(v)}>{r}</button>)}</div>
      <div style="margin-top:8px"><button class="btn-tinta" type="submit"><Icone nome="mais" tamanho={18} />Criar conta</button></div>
    </form>
  </>);
}

function Cartoes({ d, feito }: P) {
  const cartoes = d.contas.filter((c) => c.tipo === "credit_card" && c.ativa);
  const [id, setId] = useState(cartoes[0]?.id ?? ""), [f, setF] = useState("4"), [v, setV] = useState("11"), [desde, setDesde] = useState(hoje());
  return (<>
    <div class="lista">{d.prazos.map((p) => <div class="item"><span class="nome">{p.nome}</span><span class="valor">dia {p.fechamento} → dia {p.vencimento}</span><span class="sub">desde {p.desde.split("-").reverse().join("/")}</span><span /></div>)}</div>
    <p class="sub">Como o app do banco mostra. O gasto do dia do fechamento ainda entra na fatura que fecha nele.</p>
    {cartoes.length > 0 && <form onSubmit={(e) => { e.preventDefault(); feito(apiAjustes.prazos(id || cartoes[0]!.id, { fechamento: Number(f), vencimento: Number(v), desde }), "Prazos salvos."); }}>
      <div class="campo"><label for="a-cc">Cartão</label><select id="a-cc" value={id} onChange={(e) => setId(valor(e))}>{cartoes.map((c) => <option value={c.id}>{c.nome}</option>)}</select></div>
      <div class="kv"><Campo id="a-f" rot="Fecha no dia" type="number" value={f} onInput={(e) => setF(valor(e))} /><Campo id="a-v" rot="Vence no dia" type="number" value={v} onInput={(e) => setV(valor(e))} /></div>
      <Campo id="a-d" rot="Vale a partir de" type="date" value={desde} onInput={(e) => setDesde(valor(e))} />
      <p class="nota">Faturas anteriores a essa data continuam com os prazos antigos.</p>
      <div style="margin-top:8px"><button class="btn-tinta" type="submit"><Icone nome="ok" tamanho={18} />Salvar prazos</button></div>
    </form>}
  </>);
}

function Categorias({ d, feito }: P) {
  const [nome, setNome] = useState(""), [grupo, setGrupo] = useState(d.grupos[0]?.nome ?? ""), [tipo, setTipo] = useState("expense"), [prev, setPrev] = useState("");
  return (<>
    {[...new Set(d.categorias.map((c) => c.grupo))].map((g) => (
      <div class="grupo"><div class="grupo-cab"><span>{g}</span></div>{d.categorias.filter((c) => c.grupo === g).map((c) => (
        <div class="item"><span class="nome">{c.nome}</span><span class="valor">{c.previsto ? brl(c.previsto) : "—"}</span><span class="sub">{c.tipo === "income" ? "receita" : "despesa"} · {c.ativa ? "ativa" : "arquivada"}</span><button class="link-sub" onClick={() => feito(apiAjustes.categoria(c.id, { ativa: !c.ativa }))}>{c.ativa ? "Arquivar" : "Reativar"}</button></div>
      ))}</div>
    ))}
    <p class="sub">O previsto padrão muda pelo detalhe da categoria, no Mês ("daqui em diante"). Arquivar esconde dos formulários sem apagar o histórico.</p>
    <form onSubmit={(e) => { e.preventDefault(); feito(apiAjustes.novaCategoria({ nome, grupo, tipo, previsto: prev }), "Categoria criada."); setNome(""); }}>
      <Campo id="a-kn" rot="Nova categoria" value={nome} onInput={(e) => setNome(valor(e))} />
      <Campo id="a-kg" rot="Grupo (existente ou novo)" value={grupo} onInput={(e) => setGrupo(valor(e))} />
      <div class="chips"><button type="button" class="chip" aria-pressed={tipo === "expense"} onClick={() => setTipo("expense")}>Despesa</button><button type="button" class="chip" aria-pressed={tipo === "income"} onClick={() => setTipo("income")}>Receita</button></div>
      <Campo id="a-kp" rot="Previsto por mês (R$)" inputMode="decimal" autoComplete="off" value={prev} onInput={(e) => setPrev(valor(e))} />
      <div style="margin-top:8px"><button class="btn-tinta" type="submit"><Icone nome="mais" tamanho={18} />Criar categoria</button></div>
    </form>
  </>);
}

function Recorrentes({ d, feito }: P) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  return (
    <div class="lista">{d.recorrentes.map((r) => (
      <div class="item"><span class="nome">{r.nome}</span><span class="valor">{brl(r.valor)}</span><span class="sub">todo dia {r.dia}</span>
        {confirmar === r.id
          ? <button class="link-sub" style="color:var(--fora)" onClick={() => { setConfirmar(null); feito(apiAjustes.encerrarRecorrente(r.id), "Encerrada a partir deste mês."); }}>Confirmar encerramento</button>
          : <button class="link-sub" onClick={() => setConfirmar(r.id)}>Encerrar</button>}
      </div>
    ))}<p class="sub">Encerrar vale a partir deste mês; os meses passados continuam como foram. Para criar, marque “Repetir todo mês” no Lançar ou use “+ Conta recorrente” na Atenção.</p></div>
  );
}

function Investimento({ d, feito }: P) {
  const i = d.investimento ?? { max_pvp: 1, max_peso: 20, min_liquidez: 500000 };
  const [r, setR] = useState({ max_pvp: String(i.max_pvp), max_peso: String(i.max_peso), min_liquidez: String(i.min_liquidez) });
  const [metas, setMetas] = useState<Record<string, string>>(Object.fromEntries(CLASSES.map(([k]) => [k, String(d.metas.find((m) => m.classe === k)?.meta ?? "")])));
  const soma = Object.values(metas).reduce((s, v) => s + Number(v || 0), 0);
  return (
    <form onSubmit={(e) => { e.preventDefault(); feito(apiAjustes.regrasInvestimento({ max_pvp: Number(r.max_pvp.replace(",", ".")), max_peso: Number(r.max_peso), min_liquidez: Number(r.min_liquidez), metas: Object.fromEntries(Object.entries(metas).map(([k, v]) => [k, Number(v || 0)])) })); }}>
      <p class="sub">Regras que o "Onde aportar" usa. São suas: o app só aplica.</p>
      <h2>Meta por classe <span class="lado">soma {soma}%</span></h2>
      <div class="kv">{CLASSES.map(([k, n]) => <Campo id={`m-${k}`} rot={`${n} (%)`} inputMode="decimal" autoComplete="off" value={metas[k] ?? ""} onInput={(e) => setMetas({ ...metas, [k]: valor(e) })} />)}</div>
      <h2 style="margin-top:16px">Critérios</h2>
      <div class="kv"><Campo id="r-p" rot="P/VP máximo" inputMode="decimal" autoComplete="off" value={r.max_pvp} onInput={(e) => setR({ ...r, max_pvp: valor(e) })} /><Campo id="r-w" rot="Peso máximo por ativo (%)" inputMode="decimal" autoComplete="off" value={r.max_peso} onInput={(e) => setR({ ...r, max_peso: valor(e) })} /></div>
      <Campo id="r-l" rot="Liquidez mínima (R$ por dia)" inputMode="decimal" autoComplete="off" value={r.min_liquidez} onInput={(e) => setR({ ...r, min_liquidez: valor(e) })} />
      {soma > 100 && <p class="erro-campo">As metas somam mais de 100%.</p>}
      <div style="margin-top:12px"><button class="btn-tinta" type="submit" disabled={soma > 100}><Icone nome="ok" tamanho={18} />Salvar regras</button></div>
    </form>
  );
}

function Regras({ d, feito }: P) {
  const cats = d.categorias.filter((c) => c.ativa);
  const [contem, setContem] = useState(""), [cat, setCat] = useState(cats[0]?.id ?? "");
  return (<>
    <div class="lista">{d.regras.map((r) => <div class="item"><span class="nome">Contém “{r.contem}”</span><span class="valor">{r.categoria}</span><span class="sub">prioridade {r.prioridade}</span><button class="link-sub" onClick={() => feito(apiAjustes.apagarRegra(r.id), "Regra apagada.")}>Apagar</button></div>)}</div>
    <p class="sub">Quando a descrição contém o texto, a categoria é sugerida na importação e ao colar notificação. Menor prioridade vence.</p>
    <form onSubmit={(e) => { e.preventDefault(); feito(apiAjustes.novaRegra({ contem, categoria_id: cat || cats[0]?.id }), "Regra criada."); setContem(""); }}>
      <Campo id="g-t" rot="Se a descrição contém" value={contem} onInput={(e) => setContem(valor(e))} />
      <div class="campo"><label for="g-c">Categoria</label><select id="g-c" value={cat} onChange={(e) => setCat(valor(e))}>{cats.map((c) => <option value={c.id}>{c.grupo} · {c.nome}</option>)}</select></div>
      <div style="margin-top:8px"><button class="btn-tinta" type="submit"><Icone nome="mais" tamanho={18} />Criar regra</button></div>
    </form>
  </>);
}

function Acesso({ aoAvisar }: { aoAvisar(t: string): void }) {
  const [a, setA] = useState<Awaited<ReturnType<typeof apiAjustes.acesso>> | null>(null);
  const [email, setEmail] = useState(""), [nome, setNome] = useState("");
  const carregar = () => apiAjustes.acesso().then(setA).catch((e: Error) => aoAvisar(e.message));
  useEffect(() => { carregar(); }, []);
  const feito = (p: Promise<unknown>, m: string) => p.then(carregar).then(() => aoAvisar(m)).catch((e: Error) => aoAvisar(e.message));
  return (<>
    <p class="sub">A regra vale no banco: esconder esta tela não protegeria nada.</p>
    <div class="lista">{a?.pessoas.filter((p) => !p.demo).map((p) => <div class="item"><span class="nome">{p.nome}</span><span class="sub">{p.ativa ? "ativa" : "desativada"}{p.admin ? " · admin" : ""}</span><span class="sub">{p.email}</span>{!p.admin && <button class="link-sub" onClick={() => feito(apiAjustes.ativar(p.id, !p.ativa), p.ativa ? "Desativada." : "Reativada.")}>{p.ativa ? "Desativar" : "Reativar"}</button>}</div>)}</div>
    <form onSubmit={(e) => { e.preventDefault(); feito(apiAjustes.adicionar({ email, nome }), "Pessoa adicionada."); setEmail(""); setNome(""); }}>
      <Campo id="x-e" rot="E-mail Google" value={email} onInput={(e) => setEmail(valor(e))} /><Campo id="x-n" rot="Nome" value={nome} onInput={(e) => setNome(valor(e))} />
      <div style="margin-top:8px"><button class="btn-tinta" type="submit"><Icone nome="mais" tamanho={18} />Adicionar</button></div>
    </form>
    {a && a.registro.length > 0 && <section><h2>Registro</h2><div class="lista">{a.registro.map((r) => <div class="item"><span class="nome">{r.quem} {r.acao} {r.alvo}</span><span /><span class="sub">{r.quando.slice(0, 16).replace("T", " ")}</span><span /></div>)}</div></section>}
  </>);
}
