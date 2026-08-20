import * as fs from 'fs';
import * as path from 'path';
import { writePrgFromPr2 } from './encoding';

/**
 * Resolução das diretivas `#INCLUDE` dos fontes, espelhando o
 * `New-IncludesMaterializados` do `vfp-compiler-installer` (Compiler.ps1).
 *
 * O repositório versiona o texto (`CONST.PR2`), não o `CONST.PRG`. Se o `.PRG` não
 * existir **no caminho exato que a diretiva aponta**, o VFP não encontra o include e
 * **reescreve o path gravado no artefato** — bug corrigido lá na v2.16.77. Materializar
 * apenas o nome base na raiz não basta: `#INCLUDE ..\CONST.PRG` a partir de uma subpasta
 * precisa do arquivo uma pasta acima.
 */

/** Diretivas aceitas: `#INCLUDE foo.prg`, `# include "foo.h"`, `#INCLUDE <foo.h>`. */
const INCLUDE_RX = /^[ \t]*#[ \t]*INCLUDE[ \t]+["<]?([^\s"<>\r\n]+)[">]?/gim;

/** Nomes referenciados por `#INCLUDE` no conteúdo do fonte (sem duplicatas). */
export function getIncludeDependencies(text: string): string[] {
    const nomes = new Set<string>();
    INCLUDE_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INCLUDE_RX.exec(text)) !== null) {
        nomes.add(m[1]);
    }
    return [...nomes];
}

/**
 * Caminho absoluto onde o `.PRG` do include precisa existir para a diretiva resolver
 * exatamente como está escrita — relativo à pasta do arquivo que será compilado.
 */
export function getIncludeTargetPath(includeName: string, baseDir: string): string {
    const nome = includeName.replace(/\//g, '\\');
    return path.isAbsolute(nome) ? path.normalize(nome) : path.resolve(baseDir, nome);
}

/**
 * Procura o `.PR2` que origina o include, na mesma ordem da referência:
 * a pasta que a diretiva aponta, depois a pasta do fonte, depois a raiz do workspace.
 */
function resolveIncludeSource(
    includeName: string,
    sourceDir: string,
    rootDir?: string
): string | undefined {
    const baseName = path.parse(includeName.replace(/\//g, '\\')).name;
    const alvoDir = path.dirname(getIncludeTargetPath(includeName, sourceDir));
    const candidatos = [path.join(alvoDir, `${baseName}.PR2`), path.join(sourceDir, `${baseName}.PR2`)];
    if (rootDir) {
        candidatos.push(path.join(rootDir, `${baseName}.PR2`));
    }
    for (const c of candidatos) {
        if (fs.existsSync(c)) {
            return c;
        }
    }
    // O caminho é case-insensitive no Windows, mas a listagem não: tenta pela pasta.
    for (const dir of [alvoDir, sourceDir, rootDir].filter(Boolean) as string[]) {
        try {
            const achado = fs
                .readdirSync(dir)
                .find((f) => f.toLowerCase() === `${baseName.toLowerCase()}.pr2`);
            if (achado) {
                return path.join(dir, achado);
            }
        } catch {
            /* pasta inacessível */
        }
    }
    return undefined;
}

export interface IncludeResult {
    /** `.PRG` criados por esta chamada. */
    criados: string[];
    /** Includes cujo `.PR2` de origem não foi encontrado. */
    naoResolvidos: string[];
}

/**
 * Materializa os `.PRG` referenciados por `#INCLUDE` no caminho exato de cada diretiva,
 * convertendo o `.PR2` correspondente (UTF-8 → Windows-1252).
 *
 * Arquivos que já existem **não** são sobrescritos nem reportados como criados — assim
 * nunca se apaga algo versionado no repositório do desenvolvedor.
 */
export function materializeIncludes(
    sourcePath: string,
    convertEncoding: boolean,
    rootDir?: string
): IncludeResult {
    const criados: string[] = [];
    const naoResolvidos: string[] = [];

    let texto: string;
    try {
        texto = fs.readFileSync(sourcePath, 'latin1');
    } catch {
        return { criados, naoResolvidos };
    }

    const baseDir = path.dirname(sourcePath);
    for (const nome of getIncludeDependencies(texto)) {
        const alvo = getIncludeTargetPath(nome, baseDir);
        if (fs.existsSync(alvo)) {
            continue; // já existe (versionado ou gerado antes): mantém
        }
        const origem = resolveIncludeSource(nome, baseDir, rootDir);
        if (!origem) {
            naoResolvidos.push(nome);
            continue;
        }
        try {
            fs.mkdirSync(path.dirname(alvo), { recursive: true });
            const r = writePrgFromPr2(origem, convertEncoding);
            if (!r.success) {
                naoResolvidos.push(nome);
                continue;
            }
            // writePrgFromPr2 grava ao lado do .PR2; copia para o caminho da diretiva.
            if (path.resolve(r.prgPath).toLowerCase() !== path.resolve(alvo).toLowerCase()) {
                fs.copyFileSync(r.prgPath, alvo);
            }
            criados.push(alvo);
        } catch {
            naoResolvidos.push(nome);
        }
    }
    return { criados, naoResolvidos };
}
