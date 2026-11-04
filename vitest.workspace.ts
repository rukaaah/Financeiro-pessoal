// Três projetos: o domínio puro, o Worker com o banco falso, e a integração
// contra o Postgres do docker-compose (precisa das migrations aplicadas).
export default [
  { test: { name: "dominio", root: "packages/dominio", include: ["test/**/*.test.ts"] } },
  { test: { name: "worker", root: "worker", include: ["test/**/*.test.ts"], exclude: ["test/**/*.integracao.test.ts"] } },
  // A senha do papel `app` é definida uma vez, no globalSetup, e os arquivos rodam em série.
  { test: { name: "integracao", root: "worker", include: ["test/**/*.integracao.test.ts"], globalSetup: ["test/preparar-integracao.ts"], fileParallelism: false } },
];
