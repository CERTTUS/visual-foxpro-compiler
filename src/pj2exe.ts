import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { isUtf8 } from './encoding';
import { convertPrg2Bin, convertBin2Prg } from './foxbin2prg';

/**
 * Build do executável de um projeto VFP9 a partir do `.pj2`:
 *
 *   .pj2  --PRG2BIN-->  .pjx/.pjt  --BUILD EXE RECOMPILE-->  .EXE
 *
 * Portado do fluxo validado em `vfp-compiler-installer` (VfpExeCompiler.ps1). Três
 * detalhes vêm de lá e são obrigatórios:
 *
 *  1. **HomeDir**: o `.pj2` versionado carrega o `HomeDir` da máquina de quem o commitou.
 *     O PRG2BIN grava esse caminho no `.pjx` e o `BUILD EXE ... RECOMPILE` não encontra os
 *     fontes. Ajustamos o HomeDir para a pasta local antes de gerar o `.pjx` e restauramos
 *     o valor original no fim — o arquivo versionado não fica sujo com um caminho de máquina.
 *  2. **RECOMPILE + auto-clique**: feito pelo motor `bin/pj2exe/Build-Pj2Exe.ps1`.
 *  3. **Guarda de auto-include**: depois do build, o VFP grava no `.pjx` dependências que
 *     detectou sozinho, inchando o EXE. Regeneramos o `.pj2` (BIN2PRG), comparamos com a
 *     lista de entrada, marcamos os novos como excludentes e rebuildamos até estabilizar.
 *     O que for descoberto é persistido no `.pj2` original (auto-cura: o próximo build já
 *     não sofre o drift), aparecendo como diff no git para o desenvolvedor revisar.
 *
 * A versão do EXE não é calculada aqui: vale o que estiver no bloco `<DevInfo>` do `.pj2`
 * (`_MajorVer`/`_MinorVer`/`_Revision`), como o desenvolvedor definiu. O versionamento
 * automático é responsabilidade da pipeline.
 */

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
    /** Passadas máximas da guarda de auto-include (1 = build simples, sem guarda). */
    maxPasses: number;
    /** Raiz usada para resolver o caminho relativo dos arquivos auto-incluídos. */
    rootDir: string;
    log: (message: string) => void;
}

export interface Pj2ExeResult {
    success: boolean;
    exePath?: string;
    /** Quantos builds foram necessários (1 = estabilizou de primeira). */
    passes: number;
    /** Arquivos auto-incluídos pelo VFP e marcados como excludentes. */
    excluded: string[];
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

/** Aponta a linha `.HomeDir` do `.pj2` para o diretório local (sem tocar na lista de arquivos). */
function setHomeDir(text: string, homeDir: string): string {
    const hd = homeDir.replace(/\\+$/, '');
    return text.replace(/^([ \t]*\*<\.HomeDir\s*=\s*)'[^']*'(\s*\/>)/im, `$1'${hd}'$2`);
}

interface AddRef {
    /** Caminho como aparece no `.ADD('...')`. */
    ref: string;
    /** Nome do arquivo em minúsculas (chave de comparação entre passadas). */
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
 * Marca referências como excludentes no bloco `*<ExcludedFiles>`, casando pelo MESMO
 * caminho usado no `.ADD` (é assim que o FoxBin2Prg resolve o membro). Cria o bloco
 * quando ele não existe.
 */
function addExcludedRefs(text: string, refs: string[]): string {
    if (refs.length === 0) {
        return text;
    }
    const linhas = refs.map((r) => `\t.ITEM(lcCurdir + '${r}').Exclude = .T.`).join('\r\n');
    if (/^[ \t]*\*<\/ExcludedFiles>/m.test(text)) {
        return text.replace(/^([ \t]*)\*<\/ExcludedFiles>/m, `${linhas}\r\n$1*</ExcludedFiles>`);
    }
    // Sem bloco: cria antes do primeiro ENDWITH que fecha `loProject.FILES`.
    const rx = /(\.ADD\([^\r\n]*\r?\n)([ \t]*ENDWITH)/;
    if (!rx.test(text)) {
        return text;
    }
    const bloco = `\t*<ExcludedFiles>\r\n${linhas}\r\n\t*</ExcludedFiles>\r\n`;
    return text.replace(rx, `$1${bloco}$2`);
}

/** Letra de tipo do FileMetadata conforme a extensão (formato do FoxBin2Prg). */
function metadataType(relPath: string): string {
    switch (path.extname(relPath).toLowerCase()) {
        case '.scx': return 'K';
        case '.vcx': return 'V';
        case '.frx': return 'R';
        case '.lbx': return 'L';
        case '.mnx': return 'M';
        case '.dbc': return 'd';
        default: return 'P';
    }
}

/** Procura um arquivo pelo nome sob `root` e devolve o caminho relativo (ou `undefined`). */
function findRelativePath(root: string, base: string): string | undefined {
    const skip = new Set(['node_modules', '.git', 'foxbin2prg', 'rpt2rpa']);
    const stack = [root];
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
            } else if (entry.isFile() && entry.name.toLowerCase() === base) {
                return path.relative(root, full);
            }
        }
    }
    return undefined;
}

/**
 * Persiste no `.pj2` original os arquivos que o VFP auto-incluiu: adiciona o `.ADD(...)`
 * no topo do bloco `WITH loProject.FILES` e marca como excludente. Assim o próximo build
 * já encontra o arquivo no projeto (excluído) e não sofre o drift de novo.
 *
 * O caminho vai em minúsculas porque o FoxBin2Prg resolve o `Exclude` com `Lower()` —
 * PascalCase quebra o match (Error 2061). O Windows resolve o arquivo do mesmo jeito.
 */
function persistAutoIncludes(text: string, bases: string[], rootDir: string): { text: string; added: string[] } {
    const existing = new Set(getAddRefs(text).map((r) => r.base));
    const relPaths: string[] = [];
    for (const base of bases) {
        if (existing.has(base)) {
            continue;
        }
        const rel = findRelativePath(rootDir, base);
        if (rel) {
            relPaths.push(rel.toLowerCase());
        }
    }
    if (relPaths.length === 0) {
        return { text, added: [] };
    }

    // Os `.ADD` têm que entrar no TOPO do bloco FILES (onde o FoxBin2Prg os processa).
    // Inseridos depois, o arquivo não entra na coleção e o Exclude falha com Error 2061.
    const addLines = relPaths
        .map(
            (rel) =>
                `\t.ADD('${rel}')\t\t&& *< FileMetadata: Type="${metadataType(rel)}" Cpid="1252" ` +
                'Timestamp="0" ID="0" ObjRev="544" User="" />'
        )
        .join('\r\n');

    const rx = /^([ \t]*WITH loProject\.FILES[ \t]*\r?\n)/m;
    if (!rx.test(text)) {
        return { text, added: [] }; // estrutura inesperada: não mexe
    }
    let novo = text.replace(rx, `$1${addLines}\r\n`);
    novo = addExcludedRefs(novo, relPaths);
    return { text: novo, added: relPaths };
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
 * Gera o `.EXE` do projeto a partir do `.pj2`, com a guarda de auto-include.
 * O `.pj2` é editado temporariamente (HomeDir) e restaurado ao final — só as exclusões
 * descobertas permanecem, e são reportadas ao chamador.
 */
export async function buildExeFromPj2(pj2Path: string, options: Pj2ExeOptions): Promise<Pj2ExeResult> {
    if (!isPj2File(pj2Path)) {
        return { success: false, passes: 0, excluded: [], message: `Não é um projeto .pj2: ${pj2Path}` };
    }
    if (!fs.existsSync(pj2Path)) {
        return { success: false, passes: 0, excluded: [], message: `Projeto não encontrado: ${pj2Path}` };
    }

    const dir = path.dirname(pj2Path);
    const parsed = path.parse(pj2Path);
    const pjxPath = path.join(dir, parsed.name + '.pjx');
    const exeOut = expectedExe(pj2Path);

    const original = readText(pj2Path);
    const inputBases = new Set(getAddRefs(original.text).map((r) => r.base));
    const excluded: string[] = [];
    let passes = 0;

    try {
        writeText(pj2Path, setHomeDir(original.text, dir), original.utf8);

        const prg2bin = await convertPrg2Bin(pj2Path, options.extensionPath);
        if (!prg2bin.success) {
            return { success: false, passes, excluded, message: `PRG2BIN do projeto falhou: ${prg2bin.message}` };
        }

        options.log(`BUILD EXE (passada 1): ${path.basename(exeOut)}`);
        let build = await runBuildExe(pjxPath, exeOut, options);
        passes = 1;
        if (!build.success) {
            return { success: false, passes, excluded, message: build.message };
        }

        // Guarda de auto-include: repete até nenhum arquivo novo aparecer no .pjx.
        while (passes < options.maxPasses) {
            const bin2prg = await convertBin2Prg(pjxPath, options.extensionPath);
            if (!bin2prg.success) {
                options.log(`[AVISO] guarda de auto-include pulada (BIN2PRG falhou): ${bin2prg.message}`);
                break;
            }

            const regen = readText(pj2Path);
            const novos = getAddRefs(regen.text).filter(
                (r) => !inputBases.has(r.base) && !excluded.includes(r.base)
            );
            if (novos.length === 0) {
                break; // estabilizou
            }

            options.log(
                `Auto-include detectado (${novos.length}): ${novos.map((n) => n.base).join(', ')} — marcando como excludente e rebuildando.`
            );
            let texto = addExcludedRefs(regen.text, novos.map((n) => n.ref));
            texto = setHomeDir(texto, dir);
            writeText(pj2Path, texto, regen.utf8);

            const rebuildBin = await convertPrg2Bin(pj2Path, options.extensionPath);
            if (!rebuildBin.success) {
                options.log(`[AVISO] PRG2BIN pós-exclusão falhou: ${rebuildBin.message}`);
                break;
            }

            passes++;
            options.log(`BUILD EXE (passada ${passes}): ${path.basename(exeOut)}`);
            build = await runBuildExe(pjxPath, exeOut, options);
            excluded.push(...novos.map((n) => n.base));
            if (!build.success) {
                return { success: false, passes, excluded, message: build.message };
            }
        }

        if (!fs.existsSync(exeOut)) {
            return { success: false, passes, excluded, message: 'BUILD EXE terminou sem gerar o executável.' };
        }
        return { success: true, exePath: exeOut, passes, excluded };
    } catch (err) {
        return { success: false, passes, excluded, message: (err as Error).message };
    } finally {
        // Restaura o .pj2 do desenvolvedor (descarta o HomeDir local e o texto regenerado
        // pelo BIN2PRG), preservando apenas as exclusões descobertas.
        let restored = original.text;
        if (excluded.length > 0) {
            const persisted = persistAutoIncludes(restored, excluded, options.rootDir);
            restored = persisted.text;
            if (persisted.added.length > 0) {
                options.log(
                    `[INFO] ${path.basename(pj2Path)} atualizado com ${persisted.added.length} exclusão(ões) permanente(s): ${persisted.added.join(', ')} — revise o diff no git.`
                );
            }
        }
        try {
            writeText(pj2Path, restored, original.utf8);
        } catch (err) {
            options.log(`[ERRO] falha ao restaurar ${pj2Path}: ${(err as Error).message}`);
        }
    }
}
