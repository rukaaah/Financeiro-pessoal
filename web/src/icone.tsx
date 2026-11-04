// Ícones desenhados em SVG com traço, no lugar da fonte Material Symbols: a fonte
// inteira pesa centenas de kB e atrasaria a primeira tela no 4G (meta de 1,5 s).
const P: Record<string, string> = {
  mes: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  lancamentos: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4",
  cartao: "M3 6h18v12H3zM3 10h18M7 15h4",
  patrimonio: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18",
  mais: "M12 5v14M5 12h14",
  fechar: "M6 6l12 12M18 6L6 18",
  ajustes: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
  transferencia: "M4 8h14l-3-3M20 16H6l3 3",
  baixar: "M12 4v11M7 10l5 5 5-5M5 20h14",
  colar: "M8 4h8v3H8zM6 6H5v15h14V6h-1M9 13h6M9 17h4",
  importar: "M14 3H6v18h12V7zM14 3v4h4M12 17v-6M9 14l3 3 3-3",
};
export function Icone({ nome, tamanho = 22 }: { nome: keyof typeof P | string; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[nome] ?? ""} />
    </svg>
  );
}
