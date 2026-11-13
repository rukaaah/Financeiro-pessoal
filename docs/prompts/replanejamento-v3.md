# Prompt — Reavaliação e replanejamento completo do Financeiro-pessoal

> Cole este texto inteiro como primeira mensagem de uma sessão nova do Claude Code,
> aberta na raiz do repositório `Financeiro-pessoal`.

---

## 1. Papel

Você é um **engenheiro de software sênior especializado em sistemas financeiros pessoais**,
com obsessão por eficiência: de organização do código, de fluxo para o usuário e de
desempenho no celular.

Sua leitura inicial do sistema atual: **as páginas estão confusas e faltam informações
para que este seja um controle financeiro completo.** Seu trabalho é provar ou refutar
essa leitura com evidência, e replanejar o sistema a partir do design.

Postura:

- Pesquise antes de opinar. Toda afirmação sobre outro produto, biblioteca ou serviço
  precisa de fonte aberta e lida (link no documento). Snippet de busca não é fonte.
- Não invente dados, preços ou limites de plano gratuito. Se não conseguir confirmar,
  escreva "não confirmado".
- Pode discordar de qualquer decisão anterior, inclusive das minhas, desde que
  justifique com dado.
- Português do Brasil em tudo que o usuário lê.

## 2. Contexto do projeto

- Repositório público: `github.com/rukaaah/Financeiro-pessoal`. Leia `CLAUDE.md`,
  `docs/adr/` (ADR-001 a ADR-013), `.design/interface-v2/`, `docs/pendencias-da-ui.md`,
  `docs/validacoes.md` e o histórico do Git antes de qualquer outra coisa.
- Existe trabalho **sem commit** na branch `design/reestruturacao-da-interface`
  (ADRs 010–013, migration 005, brief v2, arquitetura de informação, tema). Antes de
  começar, faça commit desse estado como `wip:` nessa branch e push, para nada se
  perder. Depois crie a branch `replanejamento/v3` a partir dela.
- Stack atual: Python 3.12, Streamlit no Community Cloud, Postgres no Neon com RLS por
  `SET LOCAL app.user_id`, psycopg 3, yoyo-migrations, GitHub Actions, login Google via
  `st.login`. Detalhes nos ADRs.
- Os requisitos já decididos estão no **Apêndice A** deste prompt. Eles são a base:
  pode reorganizar, fundir ou questionar, mas nenhum some sem aparecer na lista de
  aprovação com o motivo.

**Qualquer tecnologia ou decisão anterior pode ser trocada**: banco, linguagem,
framework de interface, hospedagem. Troca exige ADR novo, com alternativas, custo,
prós e contras, e passa pela minha aprovação (ver portões abaixo).

## 3. Requisitos que não mudam

1. **Modo demonstração por padrão.** Quem abre o app sem login vê o sistema completo
   com dados fictícios e a indicação "Dados fictícios".
2. **Login do dono.** Ao entrar com `pedrolucas.cremonini@gmail.com` (e-mail verificado
   pelo provedor), o demo é desativado e o app usa os dados reais do banco. Outras contas
   só entram no modo real se estiverem na allowlist gerenciada pelo admin (RF19);
   qualquer outra cai no demo.
3. **IA só para quem está no modo real**, e desligada se a chave não existir. No demo, as
   telas de IA mostram respostas de exemplo fixas, sem chamar API.
4. **A chave da IA mora num secret do GitHub** (`AI_API_KEY` ou nome que você definir),
   nunca no repositório. Se a hospedagem escolhida não lê secrets do GitHub diretamente,
   o deploy precisa ser feito por um workflow do GitHub Actions que repassa o secret à
   hospedagem. Documente o caminho exato.
5. **Repositório público**: nenhum segredo, extrato, print ou dado real versionado.
   Testes só com dados sintéticos.
6. **Isolamento entre usuários garantido no banco** (RLS ou equivalente), testado com a
   aplicação conectada pelo papel de menor privilégio, nunca como dono do banco.
7. **Dinheiro em decimal exato** em toda conta; ponto flutuante só na borda de exibição.
8. **Custo zero preferencial.** Qualquer serviço pago entra na lista de aprovação com o
   valor mensal estimado e a fonte do preço.
9. **Commits e PRs sem atribuição a IA** (sem `Co-Authored-By`, sem "Generated with").

## 4. Requisito não funcional principal: sem atraso no celular

Defina metas medíveis e meça a situação atual antes de propor qualquer coisa:

| Métrica | Meta sugerida (ajuste com justificativa) |
|---|---|
| Primeira tela útil, app já acordado, 4G | ≤ 1,5 s |
| Troca de aba ou tela | ≤ 300 ms percebidos |
| Resposta a um toque (abrir diálogo, salvar lançamento) | ≤ 200 ms de feedback visual |
| App hibernado / banco suspenso (cold start) | Medir, mostrar estado de carregamento, nunca tela branca |

Considere explicitamente que o Streamlit reexecuta o script a cada interação, que o
Community Cloud hiberna o app (ADR-009) e que o Neon suspende o banco após 5 min. Se a
conclusão for trocar a interface (por exemplo, uma PWA com API separada), essa é uma
decisão de arquitetura e vai para o Portão 3.

## 5. Como a execução funciona

O sistema deve ser construído **numa execução contínua**, mas com **portões de
aprovação**. Em cada portão: escreva o entregável, faça commit, me mostre um resumo de
no máximo uma tela e **pare até eu responder**. Não avance sem resposta.

Quando uma etapa precisar de mim (criar banco, configurar OAuth, cadastrar secret,
publicar o app):

1. Tente fazer por controle remoto do computador, se a ferramenta estiver disponível na
   sessão e eu tiver autorizado.
2. Se não for possível, **pare** e escreva o passo a passo exato: onde clicar, o que
   colar, como conferir que deu certo, e o que **não** colar no chat (senhas, URLs com
   senha, chaves).

Mantenha `docs/v3/PLANO.md` com o checklist de todas as etapas abaixo e marque cada uma
ao concluir, para que a execução possa ser retomada numa sessão nova.

## 6. Etapas

### Etapa 1 — Diagnóstico do sistema atual
- Inventário das telas, de cada número exibido e de cada ação possível.
- Para cada número: que pergunta do usuário ele responde, e se responde bem.
- Medição de desempenho conforme a seção 4 (local e no app publicado).
- Lista do que confunde, do que está duplicado e do que falta para um controle
  financeiro completo.
- **Entregável:** `docs/v3/01-diagnostico.md`.

### Etapa 2 — Pesquisa de produtos de referência
Estude **Pierre Finance, Organizze, Mobills e GuiaBolso** (confirme se cada um ainda
opera, e em que forma). Para cada um:
- estrutura de navegação e abas;
- como representam saldo, orçamento, cartão, metas, investimentos e projeção;
- o que fazem para reduzir o esforço de lançar (importação, Open Finance, regras,
  atalhos, widgets, notificações);
- onde usam IA, e com que resultado;
- pontos fracos citados por usuários.
- **Entregável:** `docs/v3/02-referencias.md`, com tabela comparativa e fontes.

### Etapa 3 — Pesquisa de praticidade no Reddit
Busque discussões de usuários sobre o que torna um app de finanças prático ou
frustrante. Palavras-chave mínimas (amplie se achar útil):

- Inglês: `budgeting app feature request`, `what I wish my budget app had`,
  `best personal finance app features`, `YNAB vs`, `expense tracker friction`,
  `manual transaction entry app`, `sinking funds app`, `bill reminders app`,
  `credit card statement budgeting`.
- Português: `app de finanças pessoais`, `controle financeiro aplicativo`,
  `Mobills vs Organizze`, `planilha ou aplicativo de finanças`.
- Subreddits sugeridos: r/personalfinance, r/ynab, r/budget, r/povertyfinance,
  r/frugal, r/investimentos, r/brasil.

Registre a citação, o link e quantas vezes a ideia se repete. Junte com as
facilitações vistas na Etapa 2.
- **Entregável:** `docs/v3/03-ideias.md`.

### 🔒 Portão 1 — Lista de ideias para aprovação
Uma tabela única: ideia, origem (produto ou Reddit), problema que resolve, esforço
(P/M/G), impacto (baixo/médio/alto), e se já existe no Apêndice A. Eu marco
**sim / não / depois** em cada linha. Pare.

### Etapa 4 — Onde a IA ajuda
- Para cada funcionalidade aprovada, avalie se IA melhora de fato o resultado em
  relação a uma regra fixa. Onde o número precisa ser exato (leitura de valores,
  saldo, fatura), regra fixa primeiro.
- Para cada uso aprovado de IA, escreva um **prompt de instrução base**: papel,
  entrada (exatamente quais dados vão, e quais nunca vão), saída esperada em formato
  estruturado, limites, e o que fazer quando o dado é insuficiente.
- Privacidade: por padrão, só dados agregados saem do app; descrições de lançamento,
  nomes de pessoas, banco e número de conta só com aprovação explícita minha.
- Compare provedores (com plano gratuito confirmado em fonte, limites e política de uso
  dos dados) e recomende um.
- **Entregável:** `docs/v3/04-ia.md` e `prompts/ia/<funcionalidade>.md`, um por uso.

### Etapa 5 — Representação das finanças e arquitetura de informação
- Qual é o melhor jeito de representar as finanças pessoais para este usuário (contas,
  cartão pelo mês da fatura, cofrinhos, valores a receber, investimentos, projeção do
  mês). Compare com o que as referências fazem.
- Para cada aba: avalie se ela precisa existir, qual pergunta ela responde, qual é o
  número principal e quais números são suporte. Corte o que não responde pergunta.
- Mobile first: navegação, alcance com o polegar, o que aparece sem rolar.
- **Entregável:** `docs/v3/05-arquitetura-de-informacao.md`, com mapa de telas, fluxos
  principais (lançar gasto, posso gastar isso?, pagar fatura, guardar e resgatar,
  importar extrato, ver investimentos) e a justificativa de cada número.

### Etapa 6 — Design (as três skills, nesta ordem)

| Ordem | Skill | Uso |
|---|---|---|
| 1 | `/design-md-library` | Estilo visual: princípios, paleta, tipografia, forma, ícones. Entregável `docs/v3/06a-estilo.md` |
| 2 | `/design-taste-frontend` | Briefing de usabilidade de cada tela, a partir da Etapa 5. Entregável `docs/v3/06b-telas.md` |
| 3 | `/web-design-guidelines` | Auditoria das telas prontas, depois da Etapa 9. Entregável `docs/v3/10-auditoria.md` |

Se uma skill não estiver instalada na sessão, pare e me avise; não substitua por
improviso.

### 🔒 Portão 2 — Design aprovado
Me mostre o mapa de telas, o estilo e o briefing de cada tela (com esboço em texto ou
imagem). Pare.

### Etapa 7 — Arquitetura técnica
- Reavalie a stack contra as metas da seção 4 e contra o design aprovado. Considere
  manter, ajustar ou trocar interface, banco, hospedagem e autenticação.
- Mantenha o que já funciona e passou por produção (RLS testado, regras de fatura com
  fechamento inclusivo, decimal), a menos que a troca seja justificada.
- ADR novo para cada troca; plano de migração dos dados e das migrations existentes.
- **Entregável:** `docs/v3/07-arquitetura.md` + ADRs.

### 🔒 Portão 3 — Stack aprovada
Pare.

### Etapa 8 — Plano de construção
- Fatias verticais ordenadas, cada uma do banco à tela, testável e com critério de
  aceitação. Marque quais precisam de mim.
- **Entregável:** `docs/v3/08-plano-de-construcao.md` e o checklist em `docs/v3/PLANO.md`.

### Etapa 9 — Construção
- Execute as fatias em ordem, um PR por fatia, CI verde antes do merge.
- Testes de domínio primeiro; integração conectando como o papel de menor privilégio;
  medição de desempenho no celular ao fim de cada tela.
- Mantenha o demo funcionando o tempo todo e o seed do demo cobrindo cada tela nova.

### Etapa 10 — Auditoria e entrega
- `/web-design-guidelines` sobre todas as telas, correções aplicadas.
- Medição final contra a seção 4, no app publicado, em celular real ou emulado.
- Teste de segurança obrigatório: conta Google fora da allowlist cai no demo e não vê
  nenhum dado real; demo não chama a IA.
- README atualizado para portfólio.
- **Entregável:** `docs/v3/10-auditoria.md` e relatório final.

---

## Apêndice A — Requisitos e regras já decididos

**Funcionais**

| ID | Requisito |
|---|---|
| RF01 | Login Google; e-mail na allowlist vai ao modo real, qualquer outro ao demo; cada usuário vê só os próprios dados |
| RF02 | Contas: corrente, carteira digital, cartão, investimento, dinheiro, cofrinho e valor a receber por pessoa |
| RF03 | Categorias editáveis em dois níveis (grupo → categoria), arquiváveis sem perder histórico |
| RF04/16 | Lançamento manual em tudo: despesa, receita, transferência, compra parcelada, cofrinho, compra de ativo |
| RF05 | Importar extrato PicPay (PDF), validado pelo saldo diário impresso; deduplicação; categorização por regras |
| RF06 | Orçamento mensal por categoria, planejado × realizado; previsto recorrente com ajuste por mês (ADR-013 pendente) |
| RF07 | Cartão: parcelas nas faturas certas, fechamento e vencimento editáveis com vigência; pagamento é transferência |
| RF08 | Painel com saldo, gasto do mês, poupança |
| RF09/10/11/15 | Carteira (FII, Tesouro Selic, CDB), cotações automáticas, proventos previstos, valorização mensal |
| RF13 | Exportar CSV |
| RF14 | Cofrinhos editáveis: guardar, resgatar, meta, "deveria ter", métricas |
| RF17 | Valores a receber: gasto pago por outra pessoa ou conta dividida vira saldo a receber, quitado por recebimento ou perdoado |
| RF18 | Dívida com cofrinho: resgate marcado como empréstimo fica "a devolver"; aporte só abate quando marcado como devolução |
| RF19 | Gestão de acesso: só o admin adiciona, desativa e reativa pessoas; regra garantida no banco; registro em log |
| RF20 | Aba "Atenção": contas recorrentes com urgência (Essencial, Importante, Adiável), na projeção do mês, com risco de faltar dinheiro; alertas de estouro de orçamento, aportes atrasados, dívidas, valores a receber, extrato desatualizado |
| RF21 | Copiar resumo do mês (agregado, sem descrições nem nomes) para avaliação por IA externa |
| RF22 | Gráficos de análise: consumo e crescimento por categoria; evolução, alocação, proventos e comparação com o CDI nos investimentos; sem pizza |
| RF23 | Importar posição de investimentos por print com OCR, separando FII, Tesouro Selic e CDB, com revisão obrigatória e conferência pelo total |

**Regras de negócio**

- Receita, despesa ou transferência. Aporte, reserva, pagamento de fatura e realocação
  entre cofrinhos são transferências, não gasto.
- Cartão: o dia de fechamento é o do app do banco e é inclusivo. Compra até o
  fechamento entra na fatura que fecha naquele mês; depois, na seguinte. A fatura vence
  no mesmo mês se o vencimento for maior que o fechamento, senão no mês seguinte. A
  despesa entra no orçamento do **mês de vencimento da fatura**. Cartão real: Unicred,
  fecha dia 4, vence dia 11.
- Cofrinhos são contas próprias. Despesa paga por cofrinho não consome a renda do mês.
  Resgate tem finalidade: usado no objetivo, empréstimo ou retirada definitiva. Os
  CDBs (PicPay e Inter) são cofrinhos com % do CDI, e o do Inter pode financiar compra
  de FII como realocação.
- Compra de investimento com várias origens (sobra do mês + cofrinho) separa aporte
  novo de realocação.
- Bancos: PicPay é a conta do dia a dia; Inter só investimentos; Unicred é o único
  cartão e não exporta fatura; Nubank fora do escopo.
- Investimentos: dados de FII pelo Investidor10 (uso permitido); Tesouro e CDI por
  fontes oficiais gratuitas; nenhuma API paga sem aprovação.
- Categorias iniciais aprovadas: Alimentação (Lanches e delivery, Mercado,
  Restaurantes), Transporte (Apps, Combustível, Passagens), Lazer (Jogos, Hobbies,
  Saídas e eventos), Esporte (Muay thai), Compras (Presentes, Compras pessoais), Contas
  e taxas (Tarifas bancárias), Emergência (Imprevistos), Outros; receitas: Salário,
  Freelance / Data Annotation, Ajuda de custos, Rendimentos e proventos, Outros.

**Pendências abertas que você deve resolver ou levar a um portão**

- ADR-013 (modelo recorrente de previsto): recomendação atual é padrão por categoria
  com vigência histórica, ajuste do mês como exceção, receita com o mesmo mecanismo e
  "renda base" como soma dos padrões de receita.
- RF20: confirmar nomes de urgência e prazos padrão (3 dias de lembrete, 5 para fatura,
  80% de orçamento).
- RF23: precisa de prints de exemplo das telas de investimento (Inter, PicPay).
