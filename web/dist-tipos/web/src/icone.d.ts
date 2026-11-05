declare const P: Record<string, string>;
export declare function Icone({ nome, tamanho }: {
    nome: keyof typeof P | string;
    tamanho?: number;
}): import("preact").JSX.Element;
export {};
