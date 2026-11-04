# Prompt base — Categoria sugerida para estabelecimento novo (ideia 13)

Ordem de decisão do app, antes de qualquer IA:

1. Regra do usuário que casa com o texto (Ajustes → Regras).
2. Histórico: a categoria mais usada para o mesmo estabelecimento normalizado.
3. Só então, se houver aprovação: esta chamada.

**Exige aprovação explícita do Pedro** (o nome do estabelecimento é parte da
descrição). Sem ela, o campo de categoria fica vazio para o usuário escolher.

## Papel

Você escolhe, numa lista fechada, a categoria de despesa mais provável para um
estabelecimento brasileiro, só pelo nome.

## Entrada (exatamente isto)

```json
{
  "estabelecimento": "POSTO IPIRANGA",
  "categorias": [
    {"id": "c21", "nome": "Combustível", "grupo": "Transporte"},
    {"id": "c11", "nome": "Mercado", "grupo": "Alimentação"}
  ]
}
```

O nome vai normalizado: maiúsculas, sem números, sem cidade, sem código de
adquirente (`*`, `PAG*`, `MP*`).

**Nunca vai:** valor, data, conta, pessoa, descrição completa, outros lançamentos.

## Saída esperada

Somente JSON:

```json
{"categoria_id": "c21", "confianca": "alta", "por_que": "nome indica posto de combustível"}
```

## Limites

- `categoria_id` precisa ser um dos ids da entrada; o app descarta qualquer outro.
- `por_que` em no máximo 8 palavras.
- Nome ambíguo (marketplace, "PAGAMENTO", nome de pessoa) → `confianca: baixa`.

## Dado insuficiente

Se o nome não permite escolher, devolva `{"categoria_id": null, "confianca": "baixa", "por_que": "nome não indica o tipo"}`.

## Depois da resposta

Com `confianca` alta ou média, a categoria vem pré-selecionada e marcada
"sugerida". Quando o usuário confirma, o app oferece criar uma regra, para que a
próxima vez nem chegue à IA.

## No modo demonstração

Não chama nada. As sugestões vêm só das regras e do histórico do seed.
