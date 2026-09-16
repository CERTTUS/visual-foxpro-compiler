import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { isUtf8, writePrgFromPr2 } from './encoding';
import { convertPrg2Bin, convertFilesOrdered } from './foxbin2prg';
import { materializeIncludes } from './includes';

/**
 * Build do executável de um projeto VFP9 a partir do `.pj2`:
 *
 *   .pj2  --PRG2BIN-->  .pjx/.pjt  --BUILD EXE RECOMPILE-->  .EXE
 *
 * Segue o `Invoke-VfpExeFullBuild` do `vfp-compiler-installer` — o modo que gera um EXE
 * **que roda**, buildando no working tree completo. O outro modo de lá
 * (`Invoke-VfpExeSparseLote`, com workspace sparse e guarda de auto-include) serve apenas
 * para validar que o projeto compila: o EXE que ele produz não funciona, porque a guarda
 * exclui auto-includes que são dependências necessárias. Por isso aqui **não** há guarda
 * de auto-include, e o `.pj2` do desenvolvedor nunca recebe exclusões.
 *
 * Os quatro passos que a referência exige antes do build:
 *
 *  1. **`.ADD` stale**: referências cujo arquivo não existe (nem o binário, nem o texto
 *     FoxBin de origem) são removidas. Uma única ref quebrada gera um EXE defeituoso —
 *     menus que não instanciam — ou centenas de diálogos *Locate File* até o timeout.
 *  2. **Fecho de dependências**: o repositório versiona os textos, não os binários. Antes
 *     do build, os binários das dependências do projeto são regenerados a partir dos
 *     textos (com cache por data de modificação).
 *  3. **HomeDir**: o `.pj2` versionado traz o caminho da máquina de quem o commitou, e o
 *     PRG2BIN grava esse caminho no `.pjx`. Sem apontar para a pasta local, o RECOMPILE
 *     não encontra os fontes.
 *  4. **RECOMPILE + auto-clique**: no motor `bin/pj2exe/Build-Pj2Exe.ps1`.
 *
 * As alterações no `.pj2` (HomeDir e refs removidas) valem só durante o build: o arquivo
 * original é restaurado ao final.
 */

/** Projetos com build em andamento (evita dois VFP9 sobre o mesmo `.pjx`). */
const emAndamento = new Set<string>();

/** Texto FoxBin2Prg de origem para cada binário de código. */
const BIN_TO_TEXT: Record<string, string> = {
    '.prg': '.pr2',
    '.scx': '.sc2',
    '.vcx': '.vc2',
    '.frx': '.fr2',
    '.mnx': '.mn2',
    '.lbx': '.lb2',
    '.dbc': '.dc2',
};

/**
 * Ordem de regeneração dos binários, igual à da referência: classes antes dos
 * formulários (que herdam delas), depois relatórios/labels/menus/bancos, e os `.prg`
 * (conversão de encoding) por último.
 */
const BIN_ORDER: Record<string, number> = {
    '.vcx': 1,
    '.scx': 2,
    '.frx': 3,
    '.lbx': 4,
    '.mnx': 5,
    '.dbc': 6,
    '.prg': 9,
};

/** Indica se `filePath` é um projeto FoxBin2Prg em texto (`.pj2`). */
export function isPj2File(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.pj2';
}

/** Caminho do executável esperado para `pj2Path` — mesmo nome/diretório, extensão `.EXE`. */
export function expectedExe(pj2Path: string): string {
    const parsed = path.parse(pj2Path);
    return path.join(parsed.dir, parsed.name + '.EXE');
}

export interface Pj2ExeOptions {
    extensionPath: string;
    /** `vfp9.exe`; vazio deixa o motor procurar nos caminhos padrão de instalação. */
    vfp9Path?: string;
    timeoutMs: number;
    /** Raiz do repositório: base do fecho de dependências e da checagem de refs. */
    rootDir: string;
    /** Converter UTF-8 → Windows-1252 ao gerar os `.prg` das dependências. */
    convertEncoding: boolean;
    log: (message: string) => void;
}

export interface Pj2ExeResult {
    success: boolean;
    exePath?: string;
    /** Referências `.ADD` ignoradas por apontarem para arquivos inexistentes. */
    refsRemovidas: string[];
    /** Quantos binários de dependência foram regenerados antes do build. */
    binariosRegenerados: number;
    message?: string;
}

/** Texto de um arquivo e o encoding em que ele estava (para regravar sem corromper acentos). */
interface SourceText {
    text: string;
    utf8: boolean;
}

function readText(filePath: string): SourceText {
    const buffer = fs.readFileSync(filePath);
    const utf8 = isUtf8(buffer);
    return { text: utf8 ? buffer.toString('utf8') : iconv.decode(buffer, 'win1252'), utf8 };
}

function writeText(filePath: string, text: string, utf8: boolean): void {
    fs.writeFileSync(filePath, utf8 ? Buffer.from(text, 'utf8') : iconv.encode(text, 'win1252'));
}

/** Aponta a linha `.HomeDir` do `.pj2` para o diretório local. */
function setHomeDir(text: string, homeDir: string): string {
    const hd = homeDir.replace(/[\\]+$/, '');
    return text.replace(/^([ \t]*\*<\.HomeDir\s*=\s*)'[^']*'(\s*\/>)/im, `$1'${hd}'$2`);
}

interface AddRef {
    /** Caminho como aparece no `.ADD('...')`. */
    ref: string;
    /** Nome do arquivo em minúsculas. */
    base: string;
}

/** Lista as referências `.ADD('<path>')` do `.pj2`. */
function getAddRefs(text: string): AddRef[] {
    const refs: AddRef[] = [];
    const rx = /^[ \t]*\.ADD\('([^']+)'\)/gim;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
        refs.push({ ref: m[1], base: path.basename(m[1]).toLowerCase() });
    }
    return refs;
}

/**
 * Remove as linhas `.ADD` cujo arquivo não existe sob `rootDir`. Um `.ADD` de código não
 * é considerado stale quando o **texto FoxBin de origem** existe — em repositório recém
 * clonado só há os textos, e o binário é gerado logo em seguida.
 *
 * Genérico, por inexistência: nenhum nome de arquivo é fixado no código.
 */
function repairBrokenAdds(text: string, rootDir: string): { text: string; removidas: string[] } {
    const removidas: string[] = [];
    const linhas = text.split(/\r?\n/);
    const mantidas: string[] = [];

    for (const linha of linhas) {
        const m = /^[ \t]*\.ADD\('([^']+)'\)/i.exec(linha);
        if (m) {
            const rel = m[1].replace(/\//g, path.sep);
            const full = path.resolve(rootDir, rel);
            let existe = fs.existsSync(full);
            if (!existe) {
                const textExt = BIN_TO_TEXT[path.extname(full).toLowerCase()];
                if (textExt) {
                    const parsed = path.parse(full);
                    existe = fs.existsSync(path.join(parsed.dir, parsed.name + textExt));
                }
            }
            if (!existe) {
                removidas.push(m[1]);
                continue;
            }
        }
        mantidas.push(linha);
    }

    return { text: removidas.length > 0 ? mantidas.join('\r\n') : text, removidas };
}

/** Um texto FoxBin encontrado na varredura do repositório. */
interface TextEntry {
    textPath: string;
    binExt: string;
}

/** Indexa os textos FoxBin do repositório por nome-base (minúsculas). */
function indexTextsByBase(rootDir: string): Map<string, TextEntry[]> {
    const textToBin = new Map(Object.entries(BIN_TO_TEXT).map(([bin, txt]) => [txt, bin]));
    const skip = new Set(['node_modules', '.git', 'foxbin2prg', 'rpt2rpa']);
    const index = new Map<string, TextEntry[]>();
    const stack = [rootDir];

    while (stack.length > 0) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!skip.has(entry.name.toLowerCase())) {
                    stack.push(full);
                }
                continue;
            }
            const binExt = textToBin.get(path.extname(entry.name).toLowerCase());
            if (!binExt) {
                continue;
            }
            const base = path.parse(entry.name).name.toLowerCase();
            const lista = index.get(base) ?? [];
            lista.push({ textPath: full, binExt });
            index.set(base, lista);
        }
    }
    return index;
}

/** Padrões de dependência dentro dos textos FoxBin/VFP (portados da referência). */
const DEP_PATTERNS: RegExp[] = [
    /["']([\w .\\/-]+?\.(?:vcx|scx|prg|frx|mnx|lbx|vct|sct|dbc))["']/gi,
    /\bDO\s+FORM\s+([\w\\.]+)/gi,
    /\bSET\s+(?:CLASSLIB|PROCEDURE)\s+TO\s+([\w\\.]+)/gi,
    /\bDO\s+(?!FORM\b|WHILE\b|CASE\b|EVENTS\b|APPLICATION\b)([\w\\.]+)/gi,
];

/**
 * Fecho de dependências de código do projeto, por busca em largura: parte dos `.ADD` e
 * segue as referências de arquivo encontradas em cada texto (classe-pai, `SET CLASSLIB`,
 * `DO FORM`, `DO`, nomes citados entre aspas).
 *
 * O índice de textos existentes filtra o ruído — palavras que não correspondem a nenhum
 * arquivo somem sozinhas. O viés é incluir demais: sobrar é barato, faltar quebra o EXE.
 */
function dependencyClosure(pj2Text: string, index: Map<string, TextEntry[]>): TextEntry[] {
    const visitados = new Set<string>();
    const fila: string[] = [];

    for (const ref of getAddRefs(pj2Text)) {
        const base = path.parse(ref.base).name.toLowerCase();
        if (index.has(base) && !visitados.has(base)) {
            visitados.add(base);
            fila.push(base);
        }
    }

    while (fila.length > 0) {
        const base = fila.shift()!;
        for (const entry of index.get(base) ?? []) {
            let texto = '';
            try {
                texto = fs.readFileSync(entry.textPath, 'latin1');
            } catch {
                continue;
            }
            for (const rx of DEP_PATTERNS) {
                rx.lastIndex = 0;
                let m: RegExpExecArray | null;
                while ((m = rx.exec(texto)) !== null) {
                    const dep = path.parse(m[1].replace(/\//g, path.sep)).name.toLowerCase();
                    if (dep && !visitados.has(dep) && index.has(dep)) {
                        visitados.add(dep);
                        fila.push(dep);
                    }
                }
            }
        }
    }

    const result: TextEntry[] = [];
    for (const base of visitados) {
        result.push(...(index.get(base) ?? []));
    }
    return result;
}

/** Materializa os `#INCLUDE` de vários textos antes do PRG2BIN. */
function materializeIncludesEmLote(sources: string[], options: Pj2ExeOptions): void {
    const pendentes = new Set<string>();
    for (const src of sources) {
        const r = materializeIncludes(src, options.convertEncoding, options.rootDir);
        for (const nome of r.naoResolvidos) {
            pendentes.add(nome);
        }
    }
    if (pendentes.size > 0) {
        options.log(`[AVISO] #INCLUDE sem .PR2 de origem: ${[...pendentes].join(', ')}`);
    }
}

/**
 * Regenera os binários das dependências a partir dos textos, na ordem de dependência.
 * Pula quem já tem binário mais novo que o texto (cache por data de modificação).
 * Os `.pr2` viram `.prg` por conversão de encoding; os demais passam pelo PRG2BIN.
 */
async function buildBinarySet(entries: TextEntry[], options: Pj2ExeOptions): Promise<number> {
    const pendentes = entries
        .filter((e) => {
            const binPath = path.join(
                path.dirname(e.textPath),
                path.parse(e.textPath).name + e.binExt
            );
            try {
                return fs.statSync(binPath).mtimeMs < fs.statSync(e.textPath).mtimeMs;
            } catch {
                return true; // binário ausente
            }
        })
        .sort((a, b) => (BIN_ORDER[a.binExt] ?? 8) - (BIN_ORDER[b.binExt] ?? 8));

    if (pendentes.length === 0) {
        return 0;
    }

    let regenerados = 0;
    const foxTexts: string[] = [];

    for (const entry of pendentes) {
        if (entry.binExt === '.prg') {
            const r = writePrgFromPr2(entry.textPath, options.convertEncoding);
            if (r.success) {
                materializeIncludes(entry.textPath, options.convertEncoding, options.rootDir);
                regenerados++;
            }
        } else {
            foxTexts.push(entry.textPath);
        }
    }

    if (foxTexts.length > 0) {
        materializeIncludesEmLote(foxTexts, options);
        const res = await convertFilesOrdered(foxTexts, options.extensionPath);
        if (res.success) {
            regenerados += foxTexts.length;
        } else {
            options.log(`[AVISO] regeneração de dependências incompleta: ${res.message}`);
        }
    }

    return regenerados;
}

/** Executa o motor PowerShell que roda o `BUILD EXE ... RECOMPILE` com auto-clique. */
function runBuildExe(
    pjxPath: string,
    exeOut: string,
    options: Pj2ExeOptions
): Promise<{ success: boolean; message?: string }> {
    const script = path.join(options.extensionPath, 'bin', 'pj2exe', 'Build-Pj2Exe.ps1');
    if (!fs.existsSync(script)) {
        return Promise.resolve({ success: false, message: `Motor de build do EXE não encontrado: ${script}` });
    }

    const statusFile = path.join(os.tmpdir(), `pj2exe_status_${process.pid}_${Date.now()}.txt`);
    const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', script,
        '-PjxPath', pjxPath,
        '-ExeOut', exeOut,
        '-TimeoutSec', String(Math.round(options.timeoutMs / 1000)),
        '-StatusFile', statusFile,
    ];
    if (options.vfp9Path) {
        args.push('-Vfp9Path', options.vfp9Path);
    }

    return new Promise((resolve) => {
        execFile(
            'powershell.exe',
            args,
            { windowsHide: true, timeout: options.timeoutMs + 60000, maxBuffer: 8 * 1024 * 1024 },
            (error, stdout) => {
                for (const line of String(stdout || '').split(/\r?\n/)) {
                    if (line.trim()) {
                        options.log(`  ${line.trim()}`);
                    }
                }
                let status = '';
                try {
                    if (fs.existsSync(statusFile)) {
                        status = fs.readFileSync(statusFile, 'latin1').trim();
                    }
                    fs.unlinkSync(statusFile);
                } catch {
                    /* status opcional */
                }
                if (error) {
                    resolve({ success: false, message: status || error.message });
                    return;
                }
                resolve({ success: true });
            }
        );
    });
}

/**
 * Gera o `.EXE` do projeto a partir do `.pj2`. O arquivo é alterado temporariamente
 * (HomeDir local e remoção de refs quebradas) e restaurado ao final — o `.pj2` versionado
 * não sofre alteração permanente.
 */
export async function buildExeFromPj2(pj2Path: string, options: Pj2ExeOptions): Promise<Pj2ExeResult> {
    const vazio = { refsRemovidas: [] as string[], binariosRegenerados: 0 };
    if (!isPj2File(pj2Path)) {
        return { success: false, ...vazio, message: `Não é um projeto .pj2: ${pj2Path}` };
    }
    if (!fs.existsSync(pj2Path)) {
        return { success: false, ...vazio, message: `Projeto não encontrado: ${pj2Path}` };
    }

    const lockKey = path.resolve(pj2Path).toLowerCase();
    if (emAndamento.has(lockKey)) {
        return {
            success: false,
            ...vazio,
            message: 'Já há um build de EXE em andamento para este projeto — aguarde o anterior terminar.',
        };
    }
    emAndamento.add(lockKey);

    const dir = path.dirname(pj2Path);
    const parsed = path.parse(pj2Path);
    const pjxPath = path.join(dir, parsed.name + '.pjx');
    const exeOut = expectedExe(pj2Path);

    const original = readText(pj2Path);
    let refsRemovidas: string[] = [];
    let binariosRegenerados = 0;

    try {
        // 1) Refs .ADD stale — uma só quebra o EXE ou enche a tela de "Locate File".
        const reparo = repairBrokenAdds(original.text, options.rootDir);
        refsRemovidas = reparo.removidas;
        if (refsRemovidas.length > 0) {
            options.log(
                `Refs .ADD sem arquivo correspondente, ignoradas neste build (${refsRemovidas.length}): ${refsRemovidas.join(', ')}`
            );
        }

        // 2) Fecho de dependências: o repositório versiona os textos, e o BUILD EXE
        //    precisa dos binários presentes e atualizados.
        const index = indexTextsByBase(options.rootDir);
        const closure = dependencyClosure(reparo.text, index);
        binariosRegenerados = await buildBinarySet(closure, options);
        if (binariosRegenerados > 0) {
            options.log(`Dependências regeneradas antes do build: ${binariosRegenerados}.`);
        }

        // 3) HomeDir local + PRG2BIN do projeto.
        writeText(pj2Path, setHomeDir(reparo.text, dir), original.utf8);
        const prg2bin = await convertPrg2Bin(pj2Path, options.extensionPath);
        if (!prg2bin.success) {
            return {
                success: false,
                refsRemovidas,
                binariosRegenerados,
                message: `PRG2BIN do projeto falhou: ${prg2bin.message}`,
            };
        }

        // 4) BUILD EXE ... RECOMPILE, sem guarda de auto-include: os auto-includes são
        //    dependências reais e removê-los produziria um EXE que não roda.
        options.log(`BUILD EXE: ${path.basename(exeOut)}`);
        const build = await runBuildExe(pjxPath, exeOut, options);
        if (!build.success) {
            return { success: false, refsRemovidas, binariosRegenerados, message: build.message };
        }
        if (!fs.existsSync(exeOut)) {
            return {
                success: false,
                refsRemovidas,
                binariosRegenerados,
                message: 'BUILD EXE terminou sem gerar o executável.',
            };
        }
        return { success: true, exePath: exeOut, refsRemovidas, binariosRegenerados };
    } catch (err) {
        return { success: false, refsRemovidas, binariosRegenerados, message: (err as Error).message };
    } finally {
        try {
            writeText(pj2Path, original.text, original.utf8);
        } catch (err) {
            options.log(`[ERRO] falha ao restaurar ${pj2Path}: ${(err as Error).message}`);
        }
        emAndamento.delete(lockKey);
    }
}
