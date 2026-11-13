import { useEffect, useRef, useState } from "preact/hooks";
import { contaRecorrenteDoGasto } from "@financeiro/dominio";
import { api, apiAjustes, hoje, type Opcoes } from "../api.ts";
import { Icone } from "../icone.tsx";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesDaFatura = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

/** Folha "Lançar" (06b-telas.md): abre em Gastei, com o valor focado. */
export interface Inicial { valor?: string | undefined; contaId?: string | undefined; categoriaId?: string | undefined; descricao?: string | undefined; contaRecorrenteId?: string | undefined }

type IntencaoDaFolha = "gastei" | "recebi" | "entre-contas" | "vou-receber";
const NOMES: Record<IntencaoDaFolha, string> = { gastei: "Gastei", recebi: "Recebi", "entre-contas": "Entre contas", "vou-receber": "Vou receber" };
const VALOR_OK = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/;

/** Campo obrigatório ainda vazio: realçado desde o início, e em vermelho depois de tentar salvar. */
const classeDoCampo = (falta: boolean, tentou: boolean) => `campo${falta ? (tentou ? " falta tentou" : " falta") : ""}`;
const Rotulo = ({ para, texto, falta }: { para: string; texto: string; falta: boolean }) => <label for={para}>{texto}{falta && <span class="marca-falta">preencher</span>}</label>;

export function Lancar({ opcoes, inicial, intencaoInicial, ptax, descontoPb, aoFechar, aoLancar, aoPrever, aoRepetir, aoTransferir, aoRecarregarOpcoes }: { opcoes: Opcoes | null; inicial?: Inicial | undefined; intencaoInicial?: "gastei" | "recebi" | undefined; ptax?: string | null; descontoPb?: number; aoFechar(): void; aoLancar(corpo: object): void; aoPrever(corpo: object): void; aoRepetir(conta: object, corpo: object): void; aoTransferir(corpo: object): void; aoRecarregarOpcoes(): Promise<unknown> }) {
  const [intencao, setIntencao] = useState<IntencaoDaFolha>(intencaoInicial ?? "gastei");
  const [valor, setValor] = useState(inicial?.valor ?? "");
  const [contaId, setContaId] = useState(inicial?.contaId ?? "");
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? "");
  const [moeda, setMoeda] = useState<"USD" | "BRL">("USD");
  const [data, setData] = useState(hoje());
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [parcelas, setParcelas] = useState(1);
  const [fatura, setFatura] = useState<string | null>(null);
  const [repetir, setRepetir] = useState(false);
  const [erro, setErro] = useState("");
  const [tentou, setTentou] = useState(false);
  const [destinoId, setDestinoId] = useState("");
  // Criar categoria ou conta sem sair do Lançar.
  const [novaCat, setNovaCat] = useState<{ nome: string; grupo: string; grupoNovo: string } | null>(null);
  const [novaConta, setNovaConta] = useState<{ nome: string; tipo: "investment" | "checking" } | null>(null);
  const [criando, setCriando] = useState(false);
  const campoValor = useRef<HTMLInputElement>(null);

  const tipo = intencao === "gastei" ? "expense" : "income";
  const estimativa = (() => {
    if (intencao !== "vou-receber" || moeda !== "USD" || !ptax) return null;
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v * Number(ptax) * (1 - (descontoPb ?? 0) / 10000) : null;
  })();
  const entreContas = intencao === "entre-contas";
  const categorias = opcoes?.categorias.filter((c) => c.tipo === tipo) ?? [];
  const grupos = [...new Set(categorias.map((c) => c.grupo))];
  // Entre contas: corrente, dinheiro e investimento (Inter, corretora…); cartão e cofrinho têm fluxo próprio.
  const proprias = [...(opcoes?.contas.filter((c) => c.tipo !== "credit_card") ?? []), ...(opcoes?.investimentos ?? []).map((c) => ({ ...c, tipo: "investment" }))];
  const contas = entreContas ? proprias : opcoes?.contas.filter((c) => intencao === "gastei" || c.tipo !== "credit_card") ?? [];
  const destinos = proprias.filter((c) => c.id !== contaId);
  const destino = destinos.find((c) => c.id === destinoId);
  const conta = contas.find((c) => c.id === contaId);
  const falta = {
    valor: !VALOR_OK.test(valor.trim()),
    categoria: !entreContas && !categoriaId,
    conta: !contaId,
    destino: entreContas && !destino,
    nome: false as boolean,
  };
  // "Repetir todo mês" só para gasto avulso: pagar uma conta que já é recorrente ou parcelar não combina com isso.
  const podeRepetir = intencao === "gastei" && !inicial?.contaRecorrenteId;
  const repete = podeRepetir && repetir;
  falta.nome = (intencao === "vou-receber" || repete) && !descricao.trim();

  useEffect(() => { campoValor.current?.focus(); }, [intencao]);
  useEffect(() => {
    if (!contas.some((c) => c.id === contaId)) setContaId(contas[0]?.id ?? "");
    if (!categorias.some((c) => c.id === categoriaId)) setCategoriaId(categorias[0]?.id ?? "");
    if (entreContas && !destinos.some((c) => c.id === destinoId)) setDestinoId(destinos.find((c) => c.tipo === "investment")?.id ?? destinos[0]?.id ?? "");
  }, [opcoes, intencao, contaId]);
  useEffect(() => {
    setFatura(null);
    if (conta?.tipo !== "credit_card") return;
    let vivo = true;
    api.faturaPrevista(conta.id, data).then((r) => vivo && setFatura(r.mes_da_fatura)).catch(() => {});
    return () => { vivo = false; };
  }, [contaId, data]);

  async function criarCategoria() {
    if (!novaCat) return;
    const grupo = (novaCat.grupo === "+" ? novaCat.grupoNovo : novaCat.grupo).trim();
    if (!novaCat.nome.trim() || !grupo) return setErro("Dê nome e grupo à categoria.");
    setCriando(true);
    try {
      const r = (await apiAjustes.novaCategoria({ nome: novaCat.nome.trim(), grupo, tipo })) as { id?: string };
      await aoRecarregarOpcoes();
      if (r.id) setCategoriaId(r.id);
      setNovaCat(null); setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Não deu para criar a categoria."); }
    finally { setCriando(false); }
  }

  async function criarConta() {
    if (!novaConta?.nome.trim()) return setErro("Dê um nome à conta, como Inter.");
    setCriando(true);
    try {
      const r = (await apiAjustes.novaConta({ nome: novaConta.nome.trim(), tipo: novaConta.tipo })) as { id?: string };
      await aoRecarregarOpcoes();
      if (r.id) setDestinoId(r.id);
      setNovaConta(null); setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Não deu para criar a conta."); }
    finally { setCriando(false); }
  }

  function salvar(e: Event) {
    e.preventDefault();
    setTentou(true);
    if (falta.valor) return setErro("Digite o valor como 42,50.");
    if (entreContas) {
      if (!contaId || !destino) return setErro("Escolha de qual conta saiu e para qual foi.");
      return aoTransferir({ origem_id: contaId, destino_id: destino.id, valor: valor.trim(), data, descricao: descricao.trim() || `Transferência para ${destino.nome}` });
    }
    if (!contaId || !categoriaId) return setErro("Escolha conta e categoria.");
    if (intencao === "vou-receber") {
      if (!descricao.trim()) return setErro("Dê um nome, como Freelance.");
      return aoPrever({ descricao: descricao.trim(), moeda, valor: valor.trim(), data, conta_id: contaId, categoria_id: categoriaId });
    }
    const corpo = { intencao, valor: valor.trim(), conta_id: contaId, categoria_id: categoriaId, data, descricao: descricao.trim(), parcelas: conta?.tipo === "credit_card" && !repete ? parcelas : 1, conta_recorrente_id: inicial?.contaRecorrenteId };
    if (repete) {
      const recorrente = contaRecorrenteDoGasto({ descricao, valor, data, contaId, categoriaId });
      if ("erro" in recorrente) return setErro(recorrente.erro);
      return aoRepetir(recorrente, corpo);
    }
    aoLancar(corpo);
  }

  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-lancar">
        <div class="topo"><h3 id="t-lancar">Lançar</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <div class="chips" role="group" aria-label="O que aconteceu">
          {(["gastei", "recebi", "entre-contas", "vou-receber"] as const).map((i) => (
            <button type="button" class="chip" aria-pressed={i === intencao} onClick={() => { setIntencao(i); setTentou(false); setErro(""); setNovaCat(null); setNovaConta(null); }}>{NOMES[i]}</button>
          ))}
        </div>
        {!opcoes ? <p class="sub">Carregando contas e categorias…</p> : (
          <form onSubmit={salvar}>
            {intencao === "vou-receber" && <div class="chips" role="group" aria-label="Moeda">{(["USD", "BRL"] as const).map((m) => <button type="button" class="chip" aria-pressed={m === moeda} onClick={() => setMoeda(m)}>{m === "USD" ? "Dólar" : "Real"}</button>)}</div>}
            <div class={classeDoCampo(falta.valor, tentou)}><Rotulo para="f-valor" texto={`Valor (${intencao === "vou-receber" && moeda === "USD" ? "US$" : "R$"})`} falta={falta.valor} />
              <input id="f-valor" ref={campoValor} class="grande-in" inputMode="decimal" autoComplete="off" placeholder="0,00" value={valor} onInput={(e) => { setValor(e.currentTarget.value); setErro(""); }} /></div>
            {!entreContas && <div class={classeDoCampo(falta.categoria, tentou)}><Rotulo para="f-cat" texto="Categoria" falta={falta.categoria} />
              <select id="f-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.currentTarget.value)}>
                {!categorias.length && <option value="">Nenhuma categoria ainda</option>}
                {categorias.map((c) => <option value={c.id}>{c.grupo} · {c.nome}</option>)}
              </select>
              {!novaCat
                ? <button type="button" class="link-sub alinhar-inicio" onClick={() => setNovaCat({ nome: "", grupo: categorias.find((c) => c.id === categoriaId)?.grupo ?? grupos[0] ?? "+", grupoNovo: "" })}><Icone nome="mais" tamanho={16} />Nova categoria</button>
                : <div class="mini-form" role="group" aria-label="Nova categoria">
                    <input aria-label="Nome da nova categoria" placeholder="Nome, como Pet…" maxLength={40} value={novaCat.nome} onInput={(e) => setNovaCat({ ...novaCat, nome: e.currentTarget.value })} />
                    <select aria-label="Grupo da nova categoria" value={novaCat.grupo} onChange={(e) => setNovaCat({ ...novaCat, grupo: e.currentTarget.value })}>
                      {grupos.map((g) => <option value={g}>{g}</option>)}
                      <option value="+">Novo grupo…</option>
                    </select>
                    {novaCat.grupo === "+" && <input aria-label="Nome do novo grupo" placeholder="Nome do grupo, como Casa…" maxLength={40} value={novaCat.grupoNovo} onInput={(e) => setNovaCat({ ...novaCat, grupoNovo: e.currentTarget.value })} />}
                    <div class="mini-acoes"><button type="button" class="btn" disabled={criando} onClick={criarCategoria}><Icone nome="mais" tamanho={18} />{criando ? "Criando…" : "Criar e usar"}</button><button type="button" class="link-sub" onClick={() => setNovaCat(null)}>Cancelar</button></div>
                  </div>}
            </div>}
            <div class={classeDoCampo(falta.conta, tentou)}><Rotulo para="f-conta" texto={intencao === "gastei" ? "Pago com" : entreContas ? "Saiu de" : "Entrou em"} falta={falta.conta} />
              <select id="f-conta" value={contaId} onChange={(e) => setContaId(e.currentTarget.value)}>
                {contas.map((c) => <option value={c.id}>{c.nome}</option>)}
              </select></div>
            {entreContas && <div class={classeDoCampo(falta.destino, tentou)}><Rotulo para="f-destino" texto="Foi para" falta={falta.destino} />
              <select id="f-destino" value={destino ? destinoId : ""} onChange={(e) => setDestinoId(e.currentTarget.value)}>
                {!destinos.length && <option value="">Cadastre a outra conta</option>}
                {destinos.map((c) => <option value={c.id}>{c.nome}{c.tipo === "investment" ? " (investimento)" : ""}</option>)}
              </select>
              {!novaConta
                ? <button type="button" class="link-sub alinhar-inicio" onClick={() => setNovaConta({ nome: "", tipo: "investment" })}><Icone nome="mais" tamanho={16} />Nova conta</button>
                : <div class="mini-form" role="group" aria-label="Nova conta">
                    <input aria-label="Nome da nova conta" placeholder="Nome, como Inter…" maxLength={60} value={novaConta.nome} onInput={(e) => setNovaConta({ ...novaConta, nome: e.currentTarget.value })} />
                    <select aria-label="Tipo da nova conta" value={novaConta.tipo} onChange={(e) => setNovaConta({ ...novaConta, tipo: e.currentTarget.value as "investment" | "checking" })}>
                      <option value="investment">Investimento</option>
                      <option value="checking">Conta corrente</option>
                    </select>
                    <div class="mini-acoes"><button type="button" class="btn" disabled={criando} onClick={criarConta}><Icone nome="mais" tamanho={18} />{criando ? "Criando…" : "Criar e usar"}</button><button type="button" class="link-sub" onClick={() => setNovaConta(null)}>Cancelar</button></div>
                  </div>}
            </div>}
            {entreContas && <p class="nota">Troca de conta <b>não conta como gasto</b>. {destino?.tipo === "investment" ? <>Para investimento, entra como <b>guardado</b> no mês.</> : "Só muda o dinheiro de lugar."}</p>}
            {podeRepetir && <div class="chips" role="group" aria-label="Repetição">
              <button type="button" class="chip" aria-pressed={repetir} onClick={() => { setRepetir(!repetir); setErro(""); }}>Repetir todo mês</button>
            </div>}
            {repete && <p class="nota">Vira <b>conta recorrente</b> com vencimento todo dia {Number(data.slice(8, 10)) || "—"}, neste valor. Este lançamento já conta como o pagamento deste mês; nos próximos, ela aparece na Atenção. Encerrar fica em Ajustes.</p>}
            {conta?.tipo === "credit_card" && (
              <>
                {fatura && <p class="nota">Entra na <b>fatura que vence em {mesDaFatura(fatura)}</b>.</p>}
                {!repete && <div class="campo"><label for="f-parc">Parcelas</label>
                  <select id="f-parc" value={parcelas} onChange={(e) => setParcelas(Number(e.currentTarget.value))}>
                    {Array.from({ length: 12 }, (_, i) => <option value={i + 1}>{i === 0 ? "À vista" : `${i + 1}x`}</option>)}
                  </select></div>}
              </>
            )}
            {estimativa !== null && <p class="nota">≈ <b>R$ {estimativa.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>: PTAX de hoje ({ptax!.replace(".", ",")}) menos o desconto médio do PayPal ({((descontoPb ?? 0) / 100).toFixed(1).replace(".", ",")}%). Entra no saldo projetado na data.</p>}
            {intencao === "vou-receber" && moeda === "USD" && !ptax && <p class="nota">Sem a PTAX agora; a estimativa em reais aparece quando ela voltar.</p>}
            <div class="campo"><label for="f-data">{intencao === "vou-receber" ? "Data prevista" : "Data"}</label><input id="f-data" type="date" value={data} onInput={(e) => setData(e.currentTarget.value)} /></div>
            <div class={classeDoCampo(falta.nome, tentou)}><Rotulo para="f-desc" texto={intencao === "vou-receber" ? "Nome" : repete ? "Nome da conta" : "Descrição (opcional)"} falta={falta.nome} /><input id="f-desc" value={descricao} placeholder={repete ? "Aluguel, academia…" : entreContas ? `Transferência para ${destino?.nome ?? "…"}` : undefined} maxLength={200} onInput={(e) => setDescricao(e.currentTarget.value)} /></div>
            {erro && <p class="erro-campo" role="alert">{erro}</p>}
            <div style="margin-top:16px"><button type="submit" class="btn-tinta"><Icone nome="ok" tamanho={18} />{intencao === "vou-receber" ? "Salvar previsão" : entreContas ? "Salvar transferência" : "Salvar"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
