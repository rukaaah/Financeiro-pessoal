import type { ComponentChildren } from "preact";
// Ícones desenhados em SVG com traço, no lugar da fonte Material Symbols: a fonte
// inteira pesa centenas de kB e atrasaria a primeira tela no 4G (meta de 1,5 s).
const P: Record<string, string> = {
  mes: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  lancamentos: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4",
  cartao: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M7 15h4",
  patrimonio: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18",
  mais: "M12 5v14M5 12h14",
  fechar: "M6 6l12 12M18 6L6 18",
  ajustes: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
  transferencia: "M4 8h14l-3-3M20 16H6l3 3",
  baixar: "M12 4v11M7 10l5 5 5-5M5 20h14",
  colar: "M8 4h8v3H8zM6 6H5v15h14V6h-1M9 13h6M9 17h4",
  // IA: duas estrelas de quatro pontas. Marca tudo o que passa pela IA (Perguntar, respostas, Ajustes).
  ia: "M10 3c.7 4.4 2.2 5.9 6.6 6.6-4.4.7-5.9 2.2-6.6 6.6-.7-4.4-2.2-5.9-6.6-6.6C7.8 8.9 9.3 7.4 10 3zM18 14c.4 2.2 1.1 2.9 3.3 3.3-2.2.4-2.9 1.1-3.3 3.3-.4-2.2-1.1-2.9-3.3-3.3 2.2-.4 2.9-1.1 3.3-3.3z",
  contas: "M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h11v3M16 14h.01",
  cofrinho: "M4 5h16v14H4zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM12 9v.01M7 19v2M17 19v2",
  investimentos: "M4 19l5-6 4 3 7-9M15 7h5v5",
  receber: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M22 12h-6M19 9l-3 3 3 3",
  aportar: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 12h.01",
  comprar: "M5 8h14l-1 12H6zM9 8V7a3 3 0 0 1 6 0v1M12 11v6M9 14h6",
  importar: "M14 3H6v18h12V7zM14 3v4h4M12 17v-6M9 14l3 3 3-3",
  ok: "M5 12.5l4.5 4.5L19 7.5",
  pagar: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4",
  excluir: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  sair: "M10 4H5v16h5M14 8l4 4-4 4M18 12H9",
  recalcular: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  abrir: "M5 12h14M13 6l6 6-6 6",
  aviso: "M12 4l9 16H3zM12 10v4M12 17h.01",
};
/** Faixa de aviso. Regra da design sheet: um aviso por assunto em cada página. */
export function Aviso({ grave = false, children }: { grave?: boolean; children: ComponentChildren }) {
  return <div class="achado" role={grave ? "alert" : "note"}><Icone nome="aviso" tamanho={20} /><div>{children}</div></div>;
}
export function Icone({ nome, tamanho = 22 }: { nome: keyof typeof P | string; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[nome] ?? ""} />
    </svg>
  );
}
