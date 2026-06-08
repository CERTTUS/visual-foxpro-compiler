import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as iconv from 'iconv-lite';
import { isUtf8 } from './encoding';

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

/** Localiza o cscript.exe de 32 bits (SysWOW64), com fallback para System32. */
function resolveCscript(): string {
    const winDir = process.env.windir || process.env.SystemRoot || 'C:\\Windows';
    const wow = path.join(winDir, 'SysWOW64', 'cscript.exe');
    if (fs.existsSync(wow)) {
        return wow;
    }
    return path.join(winDir, 'System32', 'cscript.exe');
}

/** Executa o cscript com os argumentos dados e resolve com o código de saída. */
function execCscript(
    foxPath: string,
    args: string[],
    timeoutMs: number
): Promise<{ code: number; stderr: string }> {
    const cscript = resolveCscript();
    return new Promise((resolve) => {
        execFile(
            cscript,
            ['//nologo', ...args],
            { cwd: foxPath, windowsHide: true, timeout: timeoutMs },
            (error, _stdout, stderr) => {
                // execFile só popula error.code para exit != 0; sucesso => code 0.
                const code = error && typeof (error as unknown as { code?: number }).code === 'number'
                    ? (error as unknown as { code: number }).code
                    : (error ? 1 : 0);
                resolve({ code, stderr: stderr ? String(stderr) : '' });
            }
        );
    });
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
 * Converte um arquivo de texto UTF-8 para Windows-1252 in-place, devolvendo os
 * bytes originais para posterior restauração. Retorna `null` se nada foi alterado
 * (arquivo vazio ou não-UTF-8), caso em que não há o que restaurar.
 */
function toWin1252InPlace(filePath: string): Buffer | null {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length === 0 || !isUtf8(buffer)) {
        return null;
    }
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1); // remove BOM UTF-8
    }
    fs.writeFileSync(filePath, iconv.encode(text, 'win1252'), { flag: 'w' });
    return buffer;
}

/** Restaura os bytes originais de um arquivo (best-effort, não lança). */
function restoreBytes(filePath: string, original: Buffer): void {
    try {
        fs.writeFileSync(filePath, original, { flag: 'w' });
    } catch {
        /* não mascara o resultado da conversão */
    }
}

/**
 * Converte um único arquivo de texto FoxBin2Prg (SC2/VC2/FR2/...) para os binários
 * VFP correspondentes (PRG2BIN), usando o VFP9 instalado via COM e o motor
 * foxbin2prg embarcado em `bin/foxbin2prg`.
 *
 * Quando `convertUtf8` é verdadeiro e o arquivo está em UTF-8, ele é convertido
 * para Windows-1252 in-place apenas durante a execução e restaurado para os bytes
 * UTF-8 originais ao final (mesmo em caso de erro). Assim os binários são gerados
 * no diretório correto e com o nome correto (inclusive quando o FoxBin2Prg
 * redireciona class-per-file para o arquivo principal).
 */
export async function convertPrg2Bin(
    textPath: string,
    extensionPath: string,
    convertUtf8: boolean
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

    let originalBytes: Buffer | null = null;
    if (convertUtf8) {
        originalBytes = toWin1252InPlace(textPath);
    }

    try {
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
    } finally {
        if (originalBytes !== null) {
            restoreBytes(textPath, originalBytes);
        }
    }
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
 * Quando `convertUtf8` é verdadeiro, todos são convertidos para Windows-1252 antes
 * do PRG2BIN e restaurados para UTF-8 ao final (mesmo em caso de erro).
 *
 * `onProgress(processed, currentName)` é chamado periodicamente com a quantidade de
 * arquivos já processados pelo VFP9 e o nome do arquivo atual (acompanha o progresso
 * em tempo real durante a sessão única).
 */
export async function convertFilesOrdered(
    orderedFiles: string[],
    extensionPath: string,
    convertUtf8: boolean,
    onProgress?: (processed: number, currentName: string) => void
): Promise<FoxBin2PrgFolderResult> {
    const { foxPath } = enginePaths(extensionPath);
    const listVbs = path.join(foxPath, 'Run-Bin2PrgList-VFP9.vbs');
    if (!fs.existsSync(listVbs)) {
        return { success: false, count: 0, message: `Motor FoxBin2Prg (lista) não encontrado: ${listVbs}` };
    }
    if (orderedFiles.length === 0) {
        return { success: true, count: 0 };
    }

    // Converte todos os textos para Windows-1252, guardando os originais por arquivo.
    const restoreMap = new Map<string, Buffer>();
    if (convertUtf8) {
        for (const file of orderedFiles) {
            try {
                const original = toWin1252InPlace(file);
                if (original !== null) {
                    restoreMap.set(file, original);
                }
            } catch {
                /* ignora arquivo problemático; segue com os demais */
            }
        }
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
        // Timeout amplo: toda a lista é processada numa só sessão do VFP9.
        const { code, stderr } = await execCscript(foxPath, [listVbs, listFile, 'PRG2BIN', statusFile], 1800000);
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
        for (const [file, original] of restoreMap) {
            restoreBytes(file, original);
        }
    }
}
