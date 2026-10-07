# Validações da Fase 0

Três riscos do plano, que só se confirmam contra o sistema publicado. Esta é a
T9: medir, registrar o número e decidir se a combinação escolhida se sustenta.

O que podia ser automatizado já está na suíte — ver a última seção.

---

## 1. Tempo de acordar do Neon

**O risco.** No plano gratuito o compute hiberna por inatividade (ADR-004), e o
container do Community Cloud também (ADR-002). As duas latências se somam na
primeira visita depois de um período parado.

**Como medir.** O jeito mais direto é ler as operações do projeto no Neon, que
já traz a duração de cada `start_compute` — ver o resultado abaixo. Para medir
pelo lado do cliente, com o endpoint do branch `dev` já em `idle`:

```bash
export DATABASE_URL='<conexão do branch dev>'
uv run python scripts/medir_cold_start.py
```

Use o branch **`dev`**, não `production`: medir é conectar, e conectar acorda o
compute. O script avisa se o compute já estava acordado, caso em que o número
não é um cold start.

**Critério.** Acima de ~5s, a latência do banco passaria a pesar na primeira
visita e exigiria alguma mitigação.

### Medido: o Neon acorda em ~0,4s

Não foi preciso cronometrar à mão. O Neon registra cada `start_compute` nas
operações do projeto, com a duração — e o branch de produção já hibernou e
acordou várias vezes sozinho:

| Branch | Amostras | Mediana | Mínimo | Máximo |
|---|---|---|---|---|
| `production` | 9 | **396 ms** | 365 ms | 506 ms |
| `dev` | 3 | 424 ms | 387 ms | 459 ms |

O provisionamento inicial do projeto levou 3204 ms, mas isso acontece uma única
vez e não é cold start.

**Conclusão: o Neon está dez vezes abaixo do limite, e não é ele o problema.**
O ADR-002 tratava as duas hibernações como comparáveis; não são. O que separa o
visitante do sistema é o sono do container — e isso virou uma decisão, não uma
medição: ver o item 2 e o ADR-009.

Isso também significa que o `scripts/medir_cold_start.py` é mais útil para
confirmar uma suspeita futura — se o plano mudar, se a região mudar — do que
para este primeiro número.

**E o lado do app?** Deixou de ser uma medição necessária. Pelo ADR-009 a
hibernação é aceita, e o que separa o visitante do sistema é um clique, não
segundos de espera. Se um dia quiser o número de todo modo:

```bash
curl -o /dev/null -s -w 'tempo total: %{time_total}s\n' \
     https://<seu-app>.streamlit.app/_stcore/health
```

---

## 2. Hibernação do app — decidido, sem monitor

**Verificado: o ping não serve para isso.** O ADR-002 escolheu o UptimeRobot
para avisar de queda e manter o container acordado. Nenhum dos dois se sustenta:

| Objetivo no ADR-002 | Realidade |
|---|---|
| Manter o container acordado | **não funciona.** O app dorme após 12h de inatividade (era 7 dias), e o Streamlit mudou o que conta como atividade: um ping HTTP checa o backend mas não carrega a página, então não reseta o timer. |
| Avisar de queda | fraco. Um app dormindo responde como "no ar", então erraria nos dois sentidos. |

Agrava: desde abril de 2025 nem um push no repositório acorda um app dormindo —
só um visitante clicando em "Yes, get this app back up!" — e o reset noturno do
demo escreve no banco sem visitar o app.

**Decisão (ADR-009): a hibernação é aceita e não há monitor externo.** Quem abrir
depois de 12h parado clica uma vez para acordar; não há erro nem perda de dado. A
alternativa — um workflow abrindo a página num navegador real a cada ~10h — fica
registrada como saída caso passe a incomodar.

Nada a medir aqui, portanto. Este item está fechado.

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
