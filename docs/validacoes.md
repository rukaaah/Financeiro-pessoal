# Validações da Fase 0

Três riscos do plano, que só se confirmam contra o sistema publicado. Esta é a
T9: medir, registrar o número e decidir se a combinação escolhida se sustenta.

O que podia ser automatizado já está na suíte — ver a última seção.

---

## 1. Tempo de acordar do Neon

**O risco.** No plano gratuito o compute hiberna por inatividade (ADR-004), e o
container do Community Cloud também (ADR-002). As duas latências se somam na
primeira visita depois de um período parado.

**Como medir.** Com o endpoint do branch `dev` já em `idle` no painel do Neon:

```bash
export DATABASE_URL='<conexão do branch dev>'
uv run python scripts/medir_cold_start.py
```

Use o branch **`dev`**, não `production`: medir é conectar, e conectar acorda o
compute. O script avisa se o compute já estava acordado, caso em que o número
não é um cold start.

**Critério.** Acima de ~5s, a primeira visita fica ruim o suficiente para o
ping do UptimeRobot deixar de ser conveniência e passar a ser necessário.

**Registre aqui:**

| Data | Cold start do Neon | Cold start do app | Soma |
|---|---|---|---|
| | | | |

Para o lado do app, cronometre o carregamento de
`https://<seu-app>.streamlit.app` com o container hibernado — o painel do
Community Cloud mostra quando ele dormiu.

---

## 2. Ping do UptimeRobot

**O risco.** O monitor existe para dois fins, e só um deles é óbvio: avisar de
queda, e **manter o container acordado**. Se o intervalo for longo demais, o
segundo não acontece.

**Como verificar.** Com o monitor ativo em
`https://<seu-app>.streamlit.app/_stcore/health` a cada 5 minutos, deixe o app
sem visita humana por algumas horas e então abra. Se carregar rápido, o ping
está segurando; se demorar como um cold start, não está.

**Registre aqui:**

| Data | Intervalo do monitor | Carregou rápido após horas parado? |
|---|---|---|
| | | |

Vale conferir no painel do UptimeRobot se há falhas registradas — elas também
indicam hibernação que o ping não evitou.

---

## 3. Conta fora da allowlist cai no demo

**O risco.** É o mais sério dos três: falhar aqui significa expor dado
financeiro real num app público.

**Já está automatizado.** `tests/integration/test_app_esqueleto.py` simula o
login e cobre quatro casos — fora da allowlist, na allowlist, e-mail certo mas
não verificado, e usuário desativado. Os testes foram validados por mutação:
remover a faixa de dados fictícios derruba 4 deles, e aceitar e-mail não
verificado derruba 3.

**O que ainda precisa ser feito à mão**, porque depende do OAuth real:

1. Numa janela anônima, abra o app publicado **sem** fazer login. Deve aparecer
   a faixa "Dados fictícios".
2. Entre com uma conta Google que **não** esteja em `app_users`. A faixa deve
   continuar lá. É o teste que importa.
3. Entre com a sua conta, que está na allowlist. A faixa deve desaparecer e os
   seus dados aparecerem.
4. Rode `UPDATE app_users SET active = false WHERE email = '<seu e-mail>'` e
   recarregue. Deve cair no demo — é assim que se revoga acesso sem deploy.
   Depois reverta.

**Registre aqui:**

| Data | Sem login | Conta fora da allowlist | Sua conta | Após `active = false` |
|---|---|---|---|---|
| | | | | |

---

## O que a suíte já cobre

Não repita à mão o que o CI roda a cada PR:

| Garantia | Onde |
|---|---|
| Isolamento entre dois usuários, em todas as tabelas | `test_isolamento_entre_usuarios.py` |
| `app.user_id` não vaza entre transações no mesmo pool | `test_unidade_de_trabalho.py` |
| Roteamento dono/demo, incluindo e-mail não verificado | `test_app_esqueleto.py` |
| Mês da fatura nos dois cartões reais | `test_ciclo_de_fatura.py` |
| Transferência soma zero | `test_migration_002_nucleo.py` |
| Seed do demo idempotente e coerente | `test_seed_demo.py` |
| Código e runbook de deploy concordam | `test_coerencia_do_deploy.py` |

As validações deste documento são justamente as que **não** cabem num teste:
elas medem o comportamento da infraestrutura de terceiros.
