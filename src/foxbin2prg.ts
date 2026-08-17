import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execCscript } from './vfpBridge';

/**
 * Mapeamento dos arquivos de texto FoxBin2Prg (principais) para os binários VFP
 * gerados na conversão PRG2BIN. As chaves estão em minúsculas.
 */
const TEXT_TO_BIN: Record<string, string[]> = {
    '.sc2': ['.scx', '.sct'],   // formulários
    '.vc2': ['.vcx', '.vct'],   // bibliotecas de classes
    '.fr2': ['.frx', '.frt'],   // relatórios
    '.lb2': ['.lbx', '.lbt'],   // labels
    '.mn2': ['.mnx', '.mnt'],   // menus
    '.pj2': ['.pjx', '.pjt'],   // projetos
    '.dc2': ['.dbc', '.dct', '.dcx'], // bancos de dados
};

/** Extensões de texto FoxBin2Prg suportadas (em minúsculas). */
export const FOXBIN2PRG_TEXT_EXTENSIONS = Object.keys(TEXT_TO_BIN);

/** Indica se a extensão é um arquivo de texto FoxBin2Prg suportado (PRG2BIN). */
export function isFoxBin2PrgText(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() in TEXT_TO_BIN;
}

/**
 * Caminhos dos binários VFP que se espera existir após converter `textPath`.
 * Considera nomes com pontos (class/form-per-file, ex.: `lib.classe.vc2`), incluindo
 * o prefixo antes do primeiro ponto, pois o FoxBin2Prg pode redirecionar para o
 * arquivo principal (`lib.vcx`).
 */
export function expectedBinaries(textPath: string): string[] {
    const ext = path.extname(textPath).toLowerCase();
    const pairs = TEXT_TO_BIN[ext];
    if (!pairs) {
        return [];
    }
    const dir = path.dirname(textPath);
    const name = path.parse(textPath).name;
    const bases = new Set<string>([name]);
    const firstDot = name.indexOf('.');
    if (firstDot > 0) {
        bases.add(name.slice(0, firstDot));
    }
    const result: string[] = [];
    for (const base of bases) {
        for (const e of pairs) {
            result.push(path.join(dir, base + e));
        }
    }
    return result;
}

export interface FoxBin2PrgResult {
    success: boolean;
    /** Binários esperados que existem após a conversão (best-effort, para log). */
    outputs: string[];
    message?: string;
}

/** Caminho do motor FoxBin2Prg embarcado e o VBS de ponte com o VFP9. */
function enginePaths(extensionPath: string): { foxPath: string; vbs: string } {
    const foxPath = path.join(extensionPath, 'bin', 'foxbin2prg');
    return { foxPath, vbs: path.join(foxPath, 'Run-Bin2Prg-VFP9.vbs') };
}

/**
 * Executa o Run-Bin2Prg-VFP9.vbs em PRG2BIN para um alvo (arquivo ou pasta) e
 * resolve com o código de saída do processo VFP9.
 */
function runVbs(
    vbs: string,
    foxPath: string,
    targetPath: string,
    recompileBase: string,
    timeoutMs: number
): Promise<{ code: number; stderr: string }> {
    return execCscript(foxPath, [vbs, targetPath, 'PRG2BIN', recompileBase], timeoutMs);
}

/**
 * Converte um único arquivo de texto FoxBin2Prg (SC2/VC2/FR2/...) para os binários
 * VFP correspondentes (PRG2BIN), usando o VFP9 instalado via COM e o motor
 * foxbin2prg embarcado em `bin/foxbin2prg`.
 *
 * A conversão de encoding UTF-8 → Windows-1252 é feita EM MEMÓRIA pelo próprio motor
 * (método `readSourceText` em foxbin2prg.prg), que detecta UTF-8 por BOM/round-trip e
 * converte com `STRCONV`. O arquivo de origem NUNCA é alterado em disco — nem o que está
 * aberto no editor — e arquivos já em Windows-1252/ANSI passam intactos.
 */
export async function convertPrg2Bin(
    textPath: string,
    extensionPath: string
): Promise<FoxBin2PrgResult> {
    const ext = path.extname(textPath).toLowerCase();
    const pairs = TEXT_TO_BIN[ext];
    if (!pairs) {
        return { success: false, outputs: [], message: `Extensão não suportada: ${ext}` };
    }

    const { foxPath, vbs } = enginePaths(extensionPath);
    if (!fs.existsSync(vbs)) {
        return { success: false, outputs: [], message: `Motor FoxBin2Prg não encontrado: ${vbs}` };
    }

    const origDir = path.dirname(textPath);
    const baseName = path.parse(textPath).name;

    const { code, stderr } = await runVbs(vbs, foxPath, textPath, origDir, 120000);
    if (code !== 0) {
        return {
            success: false,
            outputs: [],
            message: `FoxBin2Prg retornou código ${code}${stderr ? `\n${stderr}` : ''}`,
        };
    }

    // Best-effort: lista os binários esperados que existem (para o log).
    const outputs = pairs
        .map((e) => path.join(origDir, baseName + e))
        .filter((p) => fs.existsSync(p));

    return { success: true, outputs };
}

/**
 * Converte um binário VFP de volta para o texto FoxBin2Prg (BIN2PRG) — direção inversa
 * de `convertPrg2Bin`, sobrescrevendo o texto de mesmo nome no diretório do binário.
 *
 * Usado pela guarda de auto-include do build de EXE: após o `BUILD EXE ... RECOMPILE`, o
 * VFP9 grava no `.pjx` as dependências que ele mesmo detectou; regenerando o `.pj2` e
 * comparando com a lista de entrada, descobrimos o que entrou sem ter sido pedido.
 */
export async function convertBin2Prg(
    binPath: string,
    extensionPath: string
): Promise<FoxBin2PrgResult> {
    const { foxPath, vbs } = enginePaths(extensionPath);
    if (!fs.existsSync(vbs)) {
        return { success: false, outputs: [], message: `Motor FoxBin2Prg não encontrado: ${vbs}` };
    }
    if (!fs.existsSync(binPath)) {
        return { success: false, outputs: [], message: `Binário não encontrado: ${binPath}` };
    }

    const { code, stderr } = await execCscript(foxPath, [vbs, binPath, 'BIN2PRG'], 120000);
    if (code !== 0) {
        return {
            success: false,
            outputs: [],
            message: `FoxBin2Prg (BIN2PRG) retornou código ${code}${stderr ? `\n${stderr}` : ''}`,
        };
    }
    return { success: true, outputs: [] };
}

export interface FoxBin2PrgFolderResult {
    success: boolean;
    /** Quantidade de arquivos de texto considerados na pasta. */
    count: number;
    message?: string;
}

/** Prioridade de tipo na compilação (menor = compila antes). */
function typeRank(ext: string): number {
    switch (ext.toLowerCase()) {
        case '.vc2': return 0; // classes (antes dos formulários)
        case '.sc2': return 1; // formulários
        case '.pj2': return 3; // projeto por último (referencia tudo)
        default: return 2;     // fr2, lb2, mn2, dc2
    }
}

/** Chave da biblioteca de um texto (prefixo antes do primeiro ponto, em minúsculas). */
function libKey(filePath: string): string {
    const name = path.parse(filePath).name.toLowerCase();
    const dot = name.indexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Ordena os arquivos de texto FoxBin2Prg respeitando dependências de compilação:
 * VC2 (classes) antes de SC2 (formulários); entre as VC2, a ordem de `vcxPriority`
 * (por nome de biblioteca) e depois as demais em ordem alfabética; PJ2 por último.
 */
export function orderFoxBin2PrgFiles(files: string[], vcxPriority: string[]): string[] {
    const prio = vcxPriority.map((s) => s.trim().toLowerCase()).filter(Boolean);
    const prioIndex = (filePath: string): number => {
        const i = prio.indexOf(libKey(filePath));
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...files].sort((a, b) => {
        const ra = typeRank(path.extname(a));
        const rb = typeRank(path.extname(b));
        if (ra !== rb) {
            return ra - rb;
        }
        if (ra === 0) {
            const pa = prioIndex(a);
            const pb = prioIndex(b);
            if (pa !== pb) {
                return pa - pb;
            }
        }
        return a.toLowerCase().localeCompare(b.toLowerCase());
    });
}

/**
 * Converte uma lista JÁ ORDENADA de arquivos de texto FoxBin2Prg para os binários
 * correspondentes (PRG2BIN), numa única sessão do VFP9 (Run-Bin2PrgList-VFP9.vbs),
 * processando os arquivos na ordem recebida. Bem mais rápido que arquivo-a-arquivo
 * e respeita dependências (ex.: VC2 antes de SC2).
 *
 * A conversão de encoding UTF-8 → Windows-1252 é feita EM MEMÓRIA pelo próprio motor
 * (método `readSourceText` em foxbin2prg.prg); os arquivos de origem não são alterados.
 *
 * `onProgress(processed, currentName)` é chamado periodicamente com a quantidade de
 * arquivos já processados pelo VFP9 e o nome do arquivo atual (acompanha o progresso
 * em tempo real durante a sessão única).
 *
 * `pauseFile` (opcional) permite pausar a sessão: enquanto esse arquivo existir, o VBS
 * aguarda antes de processar o próximo item da lista. É o que dá efeito ao botão
 * Pausar durante o trecho mais demorado do build.
 */
export async function convertFilesOrdered(
    orderedFiles: string[],
    extensionPath: string,
    onProgress?: (processed: number, currentName: string) => void,
    pauseFile?: string
): Promise<FoxBin2PrgFolderResult> {
    const { foxPath } = enginePaths(extensionPath);
    const listVbs = path.join(foxPath, 'Run-Bin2PrgList-VFP9.vbs');
    if (!fs.existsSync(listVbs)) {
        return { success: false, count: 0, message: `Motor FoxBin2Prg (lista) não encontrado: ${listVbs}` };
    }
    if (orderedFiles.length === 0) {
        return { success: true, count: 0 };
    }

    // Lista temporária em UTF-16LE (com BOM) — suporta acentos em caminhos.
    const stamp = `${process.pid}_${Date.now()}`;
    const listFile = path.join(os.tmpdir(), `fb2p_list_${stamp}.txt`);
    const statusFile = path.join(os.tmpdir(), `fb2p_status_${stamp}.txt`);
    fs.writeFileSync(listFile, '﻿' + orderedFiles.join('\r\n'), { encoding: 'utf16le' });

    // Polling do arquivo de status para reportar progresso por arquivo em tempo real.
    let poll: NodeJS.Timeout | undefined;
    if (onProgress) {
        poll = setInterval(() => {
            try {
                const raw = fs.readFileSync(statusFile, 'latin1');
                const sep = raw.indexOf('|');
                const processed = parseInt(sep >= 0 ? raw.slice(0, sep) : raw, 10);
                if (!isNaN(processed)) {
                    onProgress(processed, sep >= 0 ? raw.slice(sep + 1).trim() : '');
                }
            } catch {
                /* status ainda não criado ou em escrita; tenta na próxima */
            }
        }, 400);
    }

    try {
        // Timeout amplo: toda a lista é processada numa só sessão do VFP9. O tempo
        // pausado não conta (o VBS fica aguardando o arquivo de pausa desaparecer).
        const { code, stderr } = await execCscript(
            foxPath,
            [listVbs, listFile, 'PRG2BIN', statusFile, pauseFile ?? ''],
            1800000,
            pauseFile ? () => fs.existsSync(pauseFile) : undefined
        );
        if (code !== 0) {
            return {
                success: false,
                count: orderedFiles.length,
                message: `FoxBin2Prg (lista) retornou código ${code}${stderr ? `\n${stderr}` : ''}`,
            };
        }
        return { success: true, count: orderedFiles.length };
    } finally {
        if (poll) {
            clearInterval(poll);
        }
        for (const tmp of [listFile, statusFile]) {
            try {
                fs.unlinkSync(tmp);
            } catch {
                /* ignora falha ao remover temporários */
            }
        }
    }
}
