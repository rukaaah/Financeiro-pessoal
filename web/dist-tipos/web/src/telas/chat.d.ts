/** Chat por contexto (prompts/ia/chat.md). A IA só vê o resultado das consultas, e o app confere cada número. */
export declare function Chat({ contexto, titulo, mes, categoriaId, aoFechar }: {
    contexto: "mes" | "categoria" | "investimentos";
    titulo: string;
    mes: string;
    categoriaId?: string;
    aoFechar(): void;
}): import("preact").JSX.Element;
