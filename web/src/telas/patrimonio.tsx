import { useState } from "preact/hooks";
import { brl, type Cofrinho, hoje, num, type Patrimonio as Dados } from "../api.ts";
import { Icone } from "../icone.tsx";
import { Investimentos } from "./investimentos.tsx";
import type { Opcoes } from "../api.ts";

type Aba = "Visão" | "Cofrinhos" | "Investimentos" | "A receber";
const dm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
export type Movimento = { tipo: "guardar" | "resgatar"; cofrinho: Cofrinho } | { tipo: "conciliar" } | { tipo: "receber-de"; id: string; nome: string; saldo: string } | { tipo: "ajustar"; id: string; nome: string; saldo: string };

export function Patrimonio({ dados, opcoes, aoMover, aoAvisar, aoPerguntar }: { dados: Dados | null; opcoes: Opcoes | null; aoMover(m: Movimento): void; aoAvisar(t: string): void; aoPerguntar(): void }) {
  const [aba, setAba] = useState<Aba>("Visão");
  const d = dados;
  const heroi = (rot: string, valor: string | undefined, conta: string, acoes?: preact.ComponentChildren) => (
    <div class="heroi" aria-busy={!d}><div class="rot">{rot}</div><div class="grande">{valor ? brl(valor) : <span class="esqueleto" />}</div><p class="conta">{conta}</p>{acoes}</div>
  );
  return (
    <>
      <header><div><h1>Patrimônio</h1><div class="sub">hoje, {dm(hoje())}</div></div></header>
      <div class="abas" role="tablist">{(["Visão", "Cofrinhos", "Investimentos", "A receber"] as Aba[]).map((a) => <button role="tab" aria-selected={a === aba} onClick={() => setAba(a)}>{a}</button>)}</div>
      {d?.cofrinhos.filter((k) => num(k.saldo) < 0).map((k) => (
        <div class="achado" role="alert"><span aria-hidden="true">!</span><div><strong>Cofrinho {k.nome} está negativo ({brl(k.saldo)}).</strong> Cofrinho não fica negativo: ele já tinha dinheiro antes do extrato. <button class="link-sub" onClick={() => aoMover({ tipo: "ajustar", id: k.id, nome: k.nome, saldo: k.saldo })}>Corrigir saldo</button></div></div>
      ))}
      {aba === "Visão" && (
        <div class="grade-desk">
          <div class="col">{heroi("Patrimônio líquido hoje", d?.patrimonio, "sem os valores a receber")}</div>
          <div class="col">{d && (
            <section><h2>As partes</h2>
              <div class="lista">
                <div class="item"><span class="nome com-icone"><Icone nome="contas" tamanho={18} />Contas</span><span class="valor">{brl(d.partes.contas)}</span><span class="sub">{d.contas.filter((k) => k.tipo !== "investment").map((k) => k.nome).join(", ") || "—"}</span><span /></div>
                <div class="item"><span class="nome com-icone"><Icone nome="cofrinho" tamanho={18} />Cofrinhos</span><span class="valor">{brl(d.partes.cofrinhos)}</span><span class="sub">{d.cofrinhos.length} cofrinhos, com os CDBs</span><span /></div>
                <div class="item"><span class="nome com-icone"><Icone nome="investimentos" tamanho={18} />Investimentos</span><span class="valor">{brl(d.partes.investimentos)}</span><span class="sub">carteira detalhada na fatia 7</span><span /></div>
                <div class="item"><span class="nome com-icone"><Icone nome="cartao" tamanho={18} />Cartão</span><span class="valor">{brl(`-${d.partes.cartao}`.replace("--", ""))}</span><span class="sub">fatura aberta e parcelas futuras</span><span /></div>
              </div>
              <div class="linha-total"><span>Patrimônio líquido</span><span>{brl(d.patrimonio)}</span></div>
              <div class="lista">
                <div class="item"><span class="nome com-icone"><Icone nome="receber" tamanho={18} />A receber de pessoas</span><span class="valor">{brl(d.a_receber)}</span><span class="sub">fora do patrimônio</span><span /></div>
                <div class="item"><span class="nome">O PayPal ficou com</span><span class="valor">{brl(d.paypal.total)}</span><span class="sub">em {hoje().slice(0, 4)}, contra a PTAX, em {d.paypal.recebimentos} recebimentos</span><span /></div>
              </div>
              <div class="rodape"><button class="btn" onClick={() => aoMover({ tipo: "conciliar" })}><Icone nome="ajustes" tamanho={18} />Conciliar saldo</button></div>
              <p class="sub">{d.contas.filter((k) => k.conciliado).map((k) => `Última conciliação: ${k.nome} em ${dm(k.conciliado)}.`).join(" ") || "Nenhuma conciliação ainda."}</p>
            </section>
          )}</div>
        </div>
      )}
      {aba === "Cofrinhos" && (
        <>
          {heroi("Guardado nos cofrinhos", d?.partes.cofrinhos, d ? `${brl(d.cofrinhos.reduce((s, k) => s + num(k.a_devolver), 0).toFixed(2))} a devolver: empréstimos que você fez para si mesmo` : " ")}
          <section><h2>Cofrinhos <span class="lado">{d?.cofrinhos.length ?? ""}</span></h2>
            {d && d.cofrinhos.length === 0 && <div class="vazio">Nenhum cofrinho ainda. Eles entram em Ajustes, na fatia 10.</div>}
            <div class="lista">{d?.cofrinhos.map((k) => {
              const atraso = k.deveria ? num(k.deveria) - num(k.saldo) : 0;
              return (
                <div class="item">
                  <span class="nome">{num(k.saldo) < 0 && <span class="selo fora">negativo</span>}{num(k.a_devolver) > 0 && <span class="selo perto">devolver {brl(k.a_devolver)}</span>}{k.nome}</span><span class={num(k.saldo) < 0 ? "valor neg" : "valor"}>{brl(k.saldo)}</span>
                  <span class="sub">{k.meta ? `meta ${brl(k.meta)}${k.deveria ? ` · deveria ter ${brl(k.deveria)}${atraso > 0 ? ` · atrasado ${brl(atraso.toFixed(2))}` : " · em dia"}` : ""}` : k.cdi ? `rende ${k.cdi.replace(".00", "")}% do CDI` : "sem meta"}</span>
                  <span class="sub">{k.progresso != null ? `${Math.round(k.progresso)}%` : ""}</span>
                  {k.progresso != null && <span class="prog"><i style={`width:${Math.min(100, k.progresso)}%`} /></span>}
                  <span class="sub" style="grid-column:1/-1;display:flex;gap:16px;margin-top:4px">
                    <button class="link-sub" onClick={() => aoMover({ tipo: "guardar", cofrinho: k })}>Guardar</button>
                    <button class="link-sub" onClick={() => aoMover({ tipo: "resgatar", cofrinho: k })}>Resgatar</button>
                    <button class="link-sub" onClick={() => aoMover({ tipo: "ajustar", id: k.id, nome: k.nome, saldo: k.saldo })}>{num(k.saldo) < 0 ? "Corrigir saldo" : "Ajustar saldo"}</button>
                  </span>
                </div>
              );
            })}</div>
          </section>
        </>
      )}
      {aba === "Investimentos" && <Investimentos opcoes={opcoes} aoAvisar={aoAvisar} aoPerguntar={aoPerguntar} />}
      {aba === "A receber" && (
        <>
          {heroi("A receber de pessoas", d?.a_receber, "Fica fora do patrimônio e do gasto do mês.")}
          {d?.receber.map((r) => (
            <section><h2><span>{r.pessoa ?? r.nome}</span><span>{brl(r.saldo)}</span></h2>
              <div class="lista">{r.itens.map((i) => <div class="item"><span class="nome">{i.descricao}</span><span class="valor">{brl(i.valor, true)}</span><span class="sub">{dm(i.data)}</span><span /></div>)}</div>
              {num(r.saldo) > 0 && <div class="rodape" style="margin-top:8px"><button class="btn" onClick={() => aoMover({ tipo: "receber-de", id: r.id, nome: r.pessoa ?? r.nome, saldo: r.saldo })}>Registrar recebimento</button></div>}
            </section>
          ))}
        </>
      )}
    </>
  );
}

export function Mover({ m, contas, aoFechar, aoSalvar }: { m: Movimento; contas: { id: string; nome: string }[]; aoFechar(): void; aoSalvar(corpo: Record<string, unknown>): void }) {
  const [valor, setValor] = useState(m.tipo === "receber-de" || (m.tipo === "ajustar" && num(m.saldo) > 0) ? brl(m.saldo).replace("R$ ", "") : "");
  const [conta, setConta] = useState(contas[0]?.id ?? "");
  const [devolucao, setDevolucao] = useState(m.tipo === "guardar" && num(m.cofrinho.a_devolver) > 0);
  const [finalidade, setFinalidade] = useState("use");
  const titulo = m.tipo === "conciliar" ? "Conciliar saldo" : m.tipo === "receber-de" ? `${m.nome} pagou` : m.tipo === "ajustar" ? `Saldo de ${m.nome}` : m.tipo === "guardar" ? `Guardar em ${m.cofrinho.nome}` : `Resgatar de ${m.cofrinho.nome}`;
  return (
    <div class="veu" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-labelledby="t-mov">
        <div class="topo"><h3 id="t-mov">{titulo}</h3><button class="icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); aoSalvar({ valor, conta_id: conta, devolucao, finalidade, data: hoje(), saldo_banco: valor }); }}>
          <div class="campo"><label for="m-val">{m.tipo === "conciliar" ? "Quanto o banco mostra agora (R$)" : m.tipo === "ajustar" ? "Quanto o cofrinho tem hoje no banco (R$)" : "Valor (R$)"}</label><input id="m-val" class="grande-in" inputMode="decimal" autoComplete="off" value={valor} onInput={(e) => setValor(e.currentTarget.value)} /></div>
          {m.tipo === "ajustar" && <p class="nota">Hoje o app mostra {brl(m.saldo)}. A diferença vira saldo inicial do cofrinho: não conta como receita, gasto nem guardado em mês nenhum.</p>}
          {m.tipo !== "ajustar" && <div class="campo"><label for="m-conta">{m.tipo === "guardar" ? "Sai de" : m.tipo === "conciliar" ? "Conta" : "Entra em"}</label><select id="m-conta" value={conta} onChange={(e) => setConta(e.currentTarget.value)}>{contas.map((c) => <option value={c.id}>{c.nome}</option>)}</select></div>}
          {m.tipo === "guardar" && num(m.cofrinho.a_devolver) > 0 && (
            <>
              <div class="chips" role="group" aria-label="É devolução?"><button type="button" class="chip" aria-pressed={devolucao} onClick={() => setDevolucao(true)}>É devolução</button><button type="button" class="chip" aria-pressed={!devolucao} onClick={() => setDevolucao(false)}>Guardado novo</button></div>
              <p class="nota">Você deve {brl(m.cofrinho.a_devolver)} a este cofrinho. Sem marcar devolução, conta como guardado novo e a dívida continua.</p>
            </>
          )}
          {m.tipo === "resgatar" && (
            <div class="campo"><label for="m-fin">Para quê</label><select id="m-fin" value={finalidade} onChange={(e) => setFinalidade(e.currentTarget.value)}>
              <option value="use">Usei no objetivo</option><option value="loan">Empréstimo (fica a devolver)</option><option value="withdrawal">Retirada definitiva</option>
            </select></div>
          )}
          <div style="margin-top:16px"><button type="submit" class="btn-tinta">Salvar</button></div>
        </form>
      </div>
    </div>
  );
}
