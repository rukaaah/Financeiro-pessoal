# Leitura de extrato (IA primeiro, regra como reserva)

Pedido do Pedro em 2026-11-07: o extrato precisa ser interpretável por IA, sem depender só
de exemplos passados, e as movimentações de cofrinho precisam virar cofrinhos com o nome
que aparece no extrato.

O texto de sistema está em `worker/src/extrato-ia.ts` (`PAPEL_EXTRATO`). O que vale:

- **Entrada**: linhas numeradas do texto do PDF, em blocos de 40, com até 6 linhas de
  contexto antes de cada bloco (para achar a data de cabeçalho); a lista de categorias
  ativas (id, nome, tipo); a data de hoje.
- **Antes de enviar** (`limparExtrato`): CPF, CNPJ, e-mail e sequências de 4 ou mais
  dígitos (fora ano) viram "•••". Nomes de pessoas, estabelecimentos e cofrinhos vão como
  estão: o Pedro decidiu em 2026-11-07 que a IA precisa deles para interpretar o extrato.
- **Saída**: `{"itens":[{linha, trecho_valor, trecho_data, data, descricao, tipo, cofrinho,
  categoria_id}]}`, com `tipo` em gasto, entrada, guardar ou resgatar.
- **Conferência** (`conferirLeituraDaIA`, em `packages/dominio`): o trecho do valor tem que
  estar na linha citada e é relido por regra; o trecho da data tem que estar na linha ou
  até 60 linhas acima e também é relido; sinal escrito que contradiz o tipo descarta o
  item; o nome do cofrinho tem que aparecer no texto até 2 linhas de distância. Linhas com
  valor que nenhum item usou são contadas e mostradas como aviso.
- **Categoria**: regra do usuário e histórico primeiro; a categoria da IA cobre o que
  nunca foi visto.
- **Cofrinho**: a prévia casa o nome com um cofrinho existente (sem caixa e sem acento); se
  não houver, a importação cria a conta `goal` com esse nome, na mesma transação.
- **Cota**: 15 leituras por dia, registradas em `ai_calls` como `extrato`. Demonstração
  nunca chama a IA e cai na regra.
