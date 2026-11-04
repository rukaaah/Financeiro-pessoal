// Três projetos: o domínio puro, o Worker com o banco falso, e a integração
// contra o Postgres do docker-compose (precisa das migrations aplicadas).
export default [
  { test: { name: "dominio", root: "packages/dominio", include: ["test/**/*.test.ts"] } },
  { test: { name: "worker", root: "worker", include: ["test/**/*.test.ts"], exclude: ["test/**/*.integracao.test.ts"] } },
  // Em série: os arquivos de integração mexem no mesmo papel `app` (ALTER ROLE) e,
  // em paralelo, o Postgres responde "tuple concurrently updated".
  { test: { name: "integracao", root: "worker", include: ["test/**/*.integracao.test.ts"], fileParallelism: false } },
];
