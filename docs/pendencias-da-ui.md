# Pendências da UI (para o Claude Code)

A UI está completa e roda sobre `app/dados.py`, que devolve dados de exemplo
(`DADOS_DE_EXEMPLO = True`). Cada item abaixo é um `TODO(claude-code)` no código:
trocar o exemplo pelo caso de uso real, mantendo as assinaturas de `app/dados.py`
e os modelos de `app/modelos.py`, para que as páginas não mudem.

Ao ligar tudo, `DADOS_DE_EXEMPLO` vira `False` e o aviso "Pré-visualização" some.

| Arquivo | Linha | O que ligar |
|---|---|---|
| `app/dados.py` | 5 | ` deve passar a chamar o caso de uso real indicado, devolvendo os mesmos modelos de `app.modelos`; as páginas não mudam. |
| `app/dados.py` | 73 | ledger.application (saldo por conta, view v_account_balance). Cofrinhos e CDBs são contas do tipo `goal`; "A receber: X" é `receivable`. |
| `app/dados.py` | 91 | budgeting.application.listar_categorias (tipo despesa, não arquivadas).""" return tuple(c.nome for c in categorias_configuradas() if c.tipo == "Despesa") |
| `app/dados.py` | 96 | budgeting.application.listar_categorias (tipo receita).""" return tuple(c.nome for c in categorias_configuradas() if c.tipo == "Receita") |
| `app/dados.py` | 101 | budgeting.application.listar_categorias (todas, com arquivadas).""" despesas = ( ("Alimentação", ("Lanches e delivery", "Mercado", "Restaurantes")), ("Transporte", ("Apps de transporte", "Combustível", "Passagens")), ("Lazer", ("Jogos", "Hobbies", "Saídas e eventos")), ("Esporte", ("Muay thai",)), ("Compras", ("Presentes", "Compras pessoais")), ("Contas e taxas", ("Tarifas bancárias",)), ("Emergência", ("Imprevistos",)), ("Outros", ("Outros",)), ) receitas = ( ("Trabalho", ("Salário", "Freelance")), ("Família", ("Ajuda de custos",)), ("Investimentos", ("Rendimentos e proventos",)), ("Outros", ("Outras entradas",)), ) itens = [ CategoriaConfigurada(grupo, nome, "Despesa") for grupo, nomes in despesas for nome in nomes ] itens += [ CategoriaConfigurada(grupo, nome, "Receita") for grupo, nomes in receitas for nome in nomes ] return tuple(itens) |
| `app/dados.py` | 128 | ledger.application.listar_contrapartes (counterparties).""" return ("Ana", "Pais") |
| `app/dados.py` | 133 | categorization.application.listar_regras.""" return ( RegraDeCategoria("UBER", "Apps de transporte", 10), RegraDeCategoria("POSTO", "Combustível", 20), RegraDeCategoria("MERCADO", "Mercado", 20), RegraDeCategoria("IFOOD", "Lanches e delivery", 30), ) |
| `app/dados.py` | 143 | ledger.application.listar_termos (account_terms vigentes).""" return (TermosDoCartao("Unicred", fechamento=4, vencimento=11, vigente_desde=date(2026, 1, 1)),) |
| `app/dados.py` | 170 | budgeting.application.orcamento_do_mes (view v_budget_month). `previsto` vem do modelo recorrente com o ajuste do mês; `realizado` soma só receitas e despesas, nunca transferências; cartão entra no mês de vencimento da fatura (ADR-005). |
| `app/dados.py` | 189 | goals.application.guardado_do_mes (view v_goal_month) e investments para aportes. Aporte é transferência; devolução a cofrinho não conta como guardado novo (RF18). |
| `app/dados.py` | 205 | budgeting.application.resumo_do_mes. Renda base é a planejada; renda real inclui a variável (freelance), que aparece como "acima do previsto". |
| `app/dados.py` | 227 | budgeting.application.modelo_de_previsto. Exige tabela nova de modelo recorrente (substitui o "copiar mês anterior" do RF06, decisão do grill de 2026-10-08) e `budgets` para os ajustes mensais. |
| `app/dados.py` | 241 | ledger + investments (patrimônio = soma das contas menos faturas em aberto). |
| `app/dados.py` | 371 | ledger.application.listar_lancamentos (filtros: período, tipo, conta, categoria, texto; paginação). Compra de cartão traz `mes_da_fatura` calculado no banco (trigger `invoice_month`). |
| `app/dados.py` | 402 | esta regra já existe no banco (`invoice_month_for`). Para a prévia do diálogo "Lançar", expor um caso de uso em `cards.application` que a consulte, e apagar esta cópia. Enquanto isso, o espelho abaixo segue a SQL: gasto até o dia do fechamento (inclusive) entra na fatura que fecha neste mês; se o vencimento não é depois do fechamento, a fatura vence no mês seguinte. |
| `app/dados.py` | 420 | ledger.application.registrar_lancamento, numa única unidade de trabalho: transferência são duas pernas; compra parcelada gera `installment_plans` + N linhas; "paguei por outra pessoa" vira transferência para a conta "A receber: X" (RF17); resgate de cofrinho grava a finalidade (`goal_movement_kind`, RF18). Nada é gravado hoje. |
| `app/dados.py` | 439 | cards.application.faturas_do_cartao (view v_invoice). A situação "paga" vem da coluna nova na perna de pagamento que aponta a fatura que quita (decisão do grill; registrar como ADR-010). |
| `app/dados.py` | 496 | cards.application.pagar_fatura. A perna de pagamento guarda o mês da fatura que quita (coluna nova, ADR-010); continua sem `invoice_month` de compra (ADR-007). |
| `app/dados.py` | 513 | goals.application.cofrinhos_do_mes (view v_goal_month). CDBs são cofrinhos com `percentual_do_cdi`. |
| `app/dados.py` | 600 | goals.application.aportar / resgatar (RF14 e RF18). |
| `app/dados.py` | 615 | ledger.application.valores_a_receber (contas `receivable` por contraparte, RF17), com o vínculo ao cofrinho de origem (RF18). |
| `app/dados.py` | 648 | ledger.application.registrar_recebimento. Se os itens vieram de dinheiro de cofrinhos, sugerir as devoluções nos valores originais (RF18). |
| `app/dados.py` | 661 | ledger.application.perdoar_divida (RF17). |
| `app/dados.py` | 676 | investments.application.carteira + market_data (job agendado no GitHub Actions grava `asset_prices`; a tela lê do banco, nunca da web). Tickers e números abaixo são FICTÍCIOS de propósito: nenhum indicador de FII real deve aparecer antes do scraper existir. |
| `app/dados.py` | 725 | investments.application.renda_fixa; CDB = cofrinho com `percentual_do_cdi`; valor de mercado do Tesouro vem do Tesouro Transparente. |
| `app/dados.py` | 738 | market_data.application.situacao_das_fontes. Falha de fonte não quebra a tela: mostra o último dado com a data. |
| `app/dados.py` | 751 | market_data.application.cdi_atual (BCB SGS). Não confiar neste número: serve só para a tela calcular algo antes da fonte existir. |
| `app/dados.py` | 760 | investments.application.premissas_padrao: DY médio dos últimos 12 meses da carteira e valorização histórica, editáveis pelo usuário. |
| `app/dados.py` | 769 | mover para `investments.domain` (regra pura, com testes) e chamar por um caso de uso. É uma conta com premissas visíveis, não uma previsão de mercado. |
| `app/dados.py` | 792 | importing.application.ler_extrato (adapter PicPay em PDF com pdfplumber; valida pelo saldo diário; deduplica por hash). O arquivo é processado em memória e descartado; CPF e número da conta nunca são guardados. |
| `app/dados.py` | 859 | identity.application.admin_listar_usuarios, que chama a função SECURITY DEFINER do banco (RF19). A regra "só admin" vale no banco; esconder a página não basta. |
| `app/dados.py` | 871 | identity.application.admin_registro (tabela access_log, RF19).""" return ( RegistroDeAcesso(date(2026, 10, 3), "dono@exemplo.com", "adicionou", "pessoa2@exemplo.com"), RegistroDeAcesso(date(2026, 10, 5), "dono@exemplo.com", "desativou", "pessoa2@exemplo.com"), ) |
| `app/dados.py` | 881 | trocar por `app_users.is_admin` (coluna nova, RF19), vinda da sessão. Hoje, todo dono é tratado como admin só para a tela existir. |
| `app/paginas/acesso.py` | 50 | identity.admin_adicionar_usuario(email, nome); valida e-mail e duplicidade. |
| `app/paginas/acesso.py` | 58 | identity.admin_desativar_usuario(alvo) |
| `app/paginas/cofrinhos.py` | 97 | goals.application.criar_cofrinho. Só o nome é obrigatório; meta, data-alvo, aporte mensal e % do CDI são opcionais e editáveis depois. |
| `app/paginas/configuracoes.py` | 38 | cards.application.salvar_termos(cartao, fecha, vence, vigencia) |
| `app/paginas/configuracoes.py` | 63 | goals.salvar_percentual_do_cdi(conta, percentual) |
| `app/paginas/configuracoes.py` | 111 | budgeting.criar_categoria (entra no modelo de previsto). |
| `app/paginas/configuracoes.py` | 128 | categorization.criar_regra |
| `app/paginas/importar.py` | 37 | passar `arquivo.getvalue()` para importing.ler_extrato. Até lá, o arquivo enviado é ignorado e a prévia é de exemplo. |
| `app/paginas/importar.py` | 92 | importing.confirmar_importacao(linhas_editadas) numa única transação. |
| `app/paginas/investimentos.py` | 34 | botão "Atualizar agora" não existe de propósito. O job agendado grava no banco (1 requisição por ticker, só tickers em carteira, com pausa). |
| `app/paginas/lancamentos.py` | 64 | edição de lançamento (ledger.atualizar_lancamento) e exportação em CSV (Fase 3, RF13). Hoje a tabela é só leitura. |
| `app/paginas/orcamento.py` | 104 | budgeting.application.salvar_previsto. Ler os valores com `app.formatacao.ler_valor` (nunca float) e gravar o padrão no modelo recorrente e os ajustes em `budgets` para este mês. |
| `app/paginas/visao_geral.py` | 3 | lá): `budgeting.resumo_do_mes`, `cards.faturas_do_cartao`, `ledger.saldo_por_conta`, patrimônio mês a mês. |
| `streamlit_app.py` | 101 | `eh_admin_de_exemplo` vira `app_users.is_admin` (RF19). |

Total: 47 pendências. Gerado por busca de `TODO(claude-code)`; regenere ao fechar itens.
