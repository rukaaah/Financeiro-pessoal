/** Ajustes (06b-telas.md): lista de áreas; cada uma abre sua tela, com um Salvar por formulário. */
export declare function Ajustes({ demo, nome, aoAvisar, aoVoltar }: {
    demo: boolean;
    nome: string;
    aoAvisar(t: string): void;
    aoVoltar(): void;
}): import("preact").JSX.Element;
