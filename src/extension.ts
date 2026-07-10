import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { writePrgFromPr2, writeSqlFromSq2 } from './encoding';
import {
    convertPrg2Bin,
    convertFilesOrdered,
    orderFoxBin2PrgFiles,
    expectedBinaries,
    isFoxBin2PrgText,
    FOXBIN2PRG_TEXT_EXTENSIONS,
} from './foxbin2prg';
import { convertRpt2Rpa, isRptFile } from './rpt2rpa';

/** Ordem padrão de compilação das bibliotecas de classes (VC2), por nome. */
const DEFAULT_VCX_ORDER = ['vclFormularios', 'vclComponentesBasicos', 'vclComponentesIntegrados'];

/**
 * Renomeia o `.FXP` gerado para coincidir com maiúsculas/minúsculas do `.prg`
 * (no Windows o compilador pode criar extensão em caixa diferente).
 */
function ensureFxpCase(originalPrgPath: string): void {
    const parsed = path.parse(originalPrgPath);
    const expectedFxp = path.join(parsed.dir, parsed.name + '.FXP');
    try {
        const files = fs.readdirSync(parsed.dir);
        const fxpFile = files.find(f => f.toLowerCase() === (parsed.name + '.fxp').toLowerCase());
        if (!fxpFile) {
            return;
        }
        const actualFxp = path.join(parsed.dir, fxpFile);
        if (actualFxp === expectedFxp) {
            return;
        }
        // Renomeação em dois passos: necessário no Windows para ajustar apenas a caixa.
        const tempPath = path.join(parsed.dir, `__fxp_tmp_${Date.now()}.fxp`);
        fs.renameSync(actualFxp, tempPath);
        fs.renameSync(tempPath, expectedFxp);
    } catch {
        /* ignora falhas de renomeação */
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Extensão Visual FoxPro Compiler ativada.');
    console.log(`context.extensionPath: ${context.extensionPath}`);

    const outputChannel = vscode.window.createOutputChannel('Visual FoxPro Compiler');

    const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
        const config = vscode.workspace.getConfiguration('visualFoxproCompiler');

        if (document.fileName.toLowerCase().endsWith('.pr2')) {
            await compilePr2(document, context, outputChannel, config);
            return;
        }

        if (document.fileName.toLowerCase().endsWith('.sq2')) {
            await convertSq2(document, outputChannel, config);
            return;
        }

        if (config.get<boolean>('enableFoxBin2Prg', true) && isFoxBin2PrgText(document.fileName)) {
            await runFoxBin2Prg(document, context, outputChannel, config);
            return;
        }
    });

    const buildCmd = vscode.commands.registerCommand(
        'visualFoxproCompiler.buildWorkspace',
        () => buildWorkspace(context, outputChannel)
    );

    const buildChangedCmd = vscode.commands.registerCommand(
        'visualFoxproCompiler.buildChangedFiles',
        () => buildChangedFiles(context, outputChannel)
    );

    context.subscriptions.push(disposable, buildCmd, buildChangedCmd, outputChannel);
}

interface Pr2Result {
    success: boolean;
    prgPath?: string;
    /** Conteúdo do arquivo .err quando a compilação reportou erros. */
    errors?: string;
    message?: string;
}

/** Executa o compilador VFP embarcado para um `.prg`. */
function runCompiler(compilerPath: string, prgPath: string): Promise<{ error?: Error; stderr: string }> {
    return new Promise((resolve) => {
        execFile(compilerPath, [prgPath], (error, _stdout, stderr) => {
            resolve({ error: error || undefined, stderr: stderr ? String(stderr) : '' });
        });
    });
}

/**
 * Gera o `.prg` a partir de um `.pr2` (UTF-8 → Windows-1252, se ativado) e o compila
 * para `.FXP`. Retorna o resultado sem interagir com a UI (reutilizável em lote).
 */
async function compilePr2File(
    pr2Path: string,
    compilerPath: string,
    convertEncoding: boolean
): Promise<Pr2Result> {
    const writeResult = writePrgFromPr2(pr2Path, convertEncoding);
    if (!writeResult.success) {
        return { success: false, message: `Falha ao gerar .prg: ${writeResult.message}` };
    }

    const prgPath = writeResult.prgPath;
    const errorFilePath = path.format({ ...path.parse(prgPath), base: undefined, ext: '.err' });

    const { error, stderr } = await runCompiler(compilerPath, prgPath);
    if (error) {
        return {
            success: false,
            prgPath,
            message: `Erro ao executar o compilador: ${error.message}${stderr ? `\n${stderr}` : ''}`,
        };
    }

    if (fs.existsSync(errorFilePath)) {
        let errors = '';
        try {
            errors = fs.readFileSync(errorFilePath, 'utf8');
            fs.unlinkSync(errorFilePath);
        } catch {
            /* mantém errors vazio */
        }
        return { success: false, prgPath, errors };
    }

    ensureFxpCase(prgPath);
    return { success: true, prgPath };
}

/**
 * Garante que o `CONST.FXP` exista na raiz do repositório antes de compilar PR2 que
 * fazem `#INCLUDE CONST.PRG`. Se faltar, compila o `CONST.PR2` da raiz primeiro
 * (gerando `CONST.prg` + `CONST.FXP`). Não conta para o resumo; apenas prepara.
 */
async function ensureConstCompiled(
    rootDir: string,
    compilerPath: string,
    convertEncoding: boolean,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    if (fs.existsSync(path.join(rootDir, 'CONST.FXP'))) {
        return;
    }
    const constPr2 = path.join(rootDir, 'CONST.PR2');
    if (!fs.existsSync(constPr2)) {
        outputChannel.appendLine(
            `[AVISO] CONST.FXP ausente e CONST.PR2 não encontrado em ${rootDir}; PR2 com #INCLUDE CONST.PRG podem falhar.`
        );
        return;
    }

    outputChannel.appendLine('CONST.FXP ausente — compilando CONST.PR2 (constantes) antes dos demais...');
    const result = await compilePr2File(constPr2, compilerPath, convertEncoding);
    if (result.success) {
        outputChannel.appendLine(`[OK]  PR2  ${constPr2}`);
    } else {
        const detail = result.errors !== undefined ? result.errors.trim() : result.message;
        outputChannel.appendLine(`[ERRO] PR2  ${constPr2}: ${detail ?? ''}`);
    }
}

/**
 * Fluxo PR2 ao salvar: gera `.prg` e compila para `.FXP`, reportando na UI.
 */
async function compilePr2(
    document: vscode.TextDocument,
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    config: vscode.WorkspaceConfiguration
): Promise<void> {
    const pr2Path = document.fileName;
    console.log(`PR2 salvo: ${pr2Path}`);
    const compilerPath = path.join(context.extensionPath, 'bin', 'visual-foxpro-compiler.exe');
    const convertEncoding = config.get<boolean>('convertEncodingBeforeCompile', true);

    // Garante o CONST.FXP na raiz (exceto quando o próprio arquivo salvo é o CONST).
    if (path.basename(pr2Path).toLowerCase() !== 'const.pr2') {
        const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (wsFolder) {
            await ensureConstCompiled(wsFolder.uri.fsPath, compilerPath, convertEncoding, outputChannel);
        }
    }

    const result = await compilePr2File(pr2Path, compilerPath, convertEncoding);
    outputChannel.appendLine(`Compilar (PR2) ${pr2Path}:`);

    if (!result.success) {
        if (result.errors !== undefined) {
            vscode.window.setStatusBarMessage('Erro(s) de compilação.', 5000);
            outputChannel.appendLine('Erro de compilação:');
            outputChannel.appendLine(result.errors);
        } else {
            console.error(result.message);
            outputChannel.appendLine(result.message ?? 'Erro desconhecido.');
            vscode.window.showErrorMessage('Erro ao compilar o .pr2.');
        }
        outputChannel.appendLine('---');
        outputChannel.show(true);
        return;
    }

    console.log('Compilação concluída com sucesso.');
    outputChannel.appendLine(`Compilação concluída: ${result.prgPath}`);
    outputChannel.appendLine('---');
    vscode.window.setStatusBarMessage('Compilação concluída', 10000);
}

interface Sq2Result {
    success: boolean;
    sqlPath?: string;
    message?: string;
}

/**
 * Gera o `.SQL` (Windows-1252) a partir de um `.sq2` (modelagem PostgreSQL em UTF-8).
 * É apenas conversão de encoding — não há compilação; o `.SQL` é o produto final lido
 * pelo VFP9. Retorna o resultado sem interagir com a UI (reutilizável em lote).
 */
function convertSq2File(sq2Path: string, convertEncoding: boolean): Sq2Result {
    const writeResult = writeSqlFromSq2(sq2Path, convertEncoding);
    if (!writeResult.success) {
        return { success: false, message: `Falha ao gerar .SQL: ${writeResult.message}` };
    }
    return { success: true, sqlPath: writeResult.sqlPath };
}

/**
 * Fluxo SQ2 ao salvar: gera o `.SQL` de mesmo nome/diretório (UTF-8 → Windows-1252),
 * reportando na UI. Sem compilação.
 */
async function convertSq2(
    document: vscode.TextDocument,
    outputChannel: vscode.OutputChannel,
    config: vscode.WorkspaceConfiguration
): Promise<void> {
    const sq2Path = document.fileName;
    console.log(`SQ2 salvo: ${sq2Path}`);
    const convertEncoding = config.get<boolean>('convertEncodingBeforeCompile', true);

    const result = convertSq2File(sq2Path, convertEncoding);
    outputChannel.appendLine(`Converter (SQ2) ${sq2Path}:`);

    if (!result.success) {
        console.error(result.message);
        outputChannel.appendLine(result.message ?? 'Erro desconhecido.');
        outputChannel.appendLine('---');
        outputChannel.show(true);
        vscode.window.showErrorMessage('Erro ao gerar o .SQL a partir do .sq2.');
        return;
    }

    outputChannel.appendLine(`SQL gerado: ${result.sqlPath}`);
    outputChannel.appendLine('---');
    vscode.window.setStatusBarMessage('SQL gerado (SQ2 → SQL)', 10000);
}

/**
 * Fluxo FoxBin2Prg ao salvar: gera os binários VFP correspondentes (PRG2BIN)
 * via VFP9 instalado (COM) e o motor foxbin2prg embarcado em `bin/foxbin2prg`.
 */
async function runFoxBin2Prg(
    document: vscode.TextDocument,
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    config: vscode.WorkspaceConfiguration
): Promise<void> {
    const textPath = document.fileName;
    console.log(`Texto FoxBin2Prg salvo: ${textPath}`);

    // Garante o CONST.FXP na raiz: SC2/VC2 também fazem #INCLUDE CONST.PRG.
    const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (wsFolder) {
        const compilerPath = path.join(context.extensionPath, 'bin', 'visual-foxpro-compiler.exe');
        const convertEncoding = config.get<boolean>('convertEncodingBeforeCompile', true);
        await ensureConstCompiled(wsFolder.uri.fsPath, compilerPath, convertEncoding, outputChannel);
    }

    outputChannel.appendLine(`FoxBin2Prg (PRG2BIN): ${textPath}`);
    vscode.window.setStatusBarMessage('Gerando binário VFP (FoxBin2Prg)...', 5000);

    let result;
    try {
        result = await convertPrg2Bin(textPath, context.extensionPath);
    } catch (err) {
        result = { success: false, outputs: [], message: (err as Error).message };
    }

    if (!result.success) {
        const msg = `Falha no FoxBin2Prg: ${result.message}`;
        console.error(msg);
        outputChannel.appendLine(msg);
        outputChannel.appendLine('---');
        vscode.window.showErrorMessage('Erro ao gerar binário VFP (FoxBin2Prg).');
        outputChannel.show(true);
        return;
    }

    if (result.outputs.length > 0) {
        outputChannel.appendLine(`Binários gerados: ${result.outputs.map((p) => path.basename(p)).join(', ')}`);
    } else {
        outputChannel.appendLine('PRG2BIN concluído.');
    }
    outputChannel.appendLine('---');
    vscode.window.setStatusBarMessage('Binário VFP gerado', 10000);
}

/** Glob (case-insensitive) das extensões de texto FoxBin2Prg, p.ex. `sc2,SC2,vc2,...`. */
function foxBin2PrgGlobExts(): string {
    return FOXBIN2PRG_TEXT_EXTENSIONS
        .map((e) => e.slice(1)) // remove o ponto
        .flatMap((e) => [e, e.toUpperCase()])
        .join(',');
}

/**
 * Comando "Compilar todo o repositório": varre o(s) workspace folder(s), gera
 * PRG+FXP de todos os `.pr2` e os binários VFP de todos os textos FoxBin2Prg.
 * Destinado a quem clonou um repositório apenas com os fontes.
 */
async function buildWorkspace(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('Abra uma pasta/repositório para compilar.');
        return;
    }

    const config = vscode.workspace.getConfiguration('visualFoxproCompiler');
    const enableFoxBin2Prg = config.get<boolean>('enableFoxBin2Prg', true);
    const enableRpt2Rpa = config.get<boolean>('enableRpt2Rpa', false);
    const confirm = config.get<boolean>('confirmBuildRepository', true);

    const exclude = '**/{node_modules,.git,foxbin2prg,rpt2rpa}/**';
    const pr2Uris = await vscode.workspace.findFiles('**/*.{pr2,PR2}', exclude);
    const sq2Uris = await vscode.workspace.findFiles('**/*.{sq2,SQ2}', exclude);
    const rptUris = enableRpt2Rpa
        ? await vscode.workspace.findFiles('**/*.{rpt,RPT}', exclude)
        : [];
    const textUris = enableFoxBin2Prg
        ? await vscode.workspace.findFiles(`**/*.{${foxBin2PrgGlobExts()}}`, exclude)
        : [];

    if (pr2Uris.length + sq2Uris.length + rptUris.length + textUris.length === 0) {
        vscode.window.showInformationMessage('Nenhum fonte FoxPro (.pr2/.sq2/.rpt/.sc2/.vc2/...) encontrado no repositório.');
        return;
    }

    if (confirm) {
        const pick = await vscode.window.showWarningMessage(
            `Compilar todo o repositório? Serão processados ${pr2Uris.length} arquivo(s) .pr2, ${sq2Uris.length} arquivo(s) .sq2, ${rptUris.length} relatório(s) .rpt e ${textUris.length} texto(s) FoxBin2Prg. Binários existentes serão sobrescritos.`,
            { modal: true },
            'Compilar'
        );
        if (pick !== 'Compilar') {
            return;
        }
    }

    await compileFileSet(
        pr2Uris.map((u) => u.fsPath),
        textUris.map((u) => u.fsPath),
        sq2Uris.map((u) => u.fsPath),
        rptUris.map((u) => u.fsPath),
        folders,
        context,
        outputChannel,
        config,
        'Compilando repositório (Visual FoxPro)',
        '=== Compilar todo o repositório ==='
    );
}

/**
 * Núcleo de compilação reutilizável. Dado um conjunto de caminhos (.pr2 e textos
 * FoxBin2Prg), garante o `CONST.FXP`, compila os `.pr2` (arquivo a arquivo) e gera os
 * binários FoxBin2Prg numa única sessão do VFP9 por workspace folder (respeitando a
 * ordem VC2 antes de SC2). Usado por "Compilar todo o repositório" e por "Compilar
 * arquivos alterados (git)".
 */
async function compileFileSet(
    pr2Paths: string[],
    textPaths: string[],
    sq2Paths: string[],
    rptPaths: string[],
    folders: readonly vscode.WorkspaceFolder[],
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    config: vscode.WorkspaceConfiguration,
    progressTitle: string,
    headerLine: string
): Promise<void> {
    const convertEncoding = config.get<boolean>('convertEncodingBeforeCompile', true);
    const enableFoxBin2Prg = config.get<boolean>('enableFoxBin2Prg', true);
    const vcxOrder = config.get<string[]>('vcxBuildOrder', DEFAULT_VCX_ORDER);

    const texts = enableFoxBin2Prg ? textPaths : [];
    // Os `.rpt` já vêm filtrados pelo chamador: "Compilar todo o repositório" respeita
    // `enableRpt2Rpa`; "Compilar alterados (git)" sempre inclui os `.rpt` alterados.
    const rpts = rptPaths;
    const total = pr2Paths.length + texts.length + sq2Paths.length + rpts.length;

    const compilerPath = path.join(context.extensionPath, 'bin', 'visual-foxpro-compiler.exe');

    outputChannel.appendLine(headerLine);
    outputChannel.show(true);

    let pr2Ok = 0;
    let pr2Fail = 0;
    let sqlOk = 0;
    let sqlFail = 0;
    let rpaOk = 0;
    let rpaFail = 0;
    let foxOk = 0;
    let foxWarn = 0;
    let foxFail = 0;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: progressTitle,
            cancellable: true,
        },
        async (progress, token) => {
            const step = 100 / Math.max(total, 1);
            let done = 0;
            const report = (message: string) => progress.report({ message: `${done} / ${total} — ${message}` });

            // 0) Garante o CONST.FXP na raiz de cada workspace folder (PR2 com #INCLUDE CONST.PRG).
            for (const folder of folders) {
                if (token.isCancellationRequested) {
                    return;
                }
                await ensureConstCompiled(folder.uri.fsPath, compilerPath, convertEncoding, outputChannel);
            }

            // 1) PR2 -> PRG + FXP (arquivo a arquivo)
            for (const pr2Path of pr2Paths) {
                if (token.isCancellationRequested) {
                    return;
                }
                done++;
                progress.report({ increment: step, message: `${done} / ${total} — ${path.basename(pr2Path)}` });
                const result = await compilePr2File(pr2Path, compilerPath, convertEncoding);
                if (result.success) {
                    pr2Ok++;
                    outputChannel.appendLine(`[OK]  PR2  ${pr2Path}`);
                } else {
                    pr2Fail++;
                    const detail = result.errors !== undefined ? result.errors.trim() : result.message;
                    outputChannel.appendLine(`[ERRO] PR2  ${pr2Path}: ${detail ?? ''}`);
                }
            }

            // 1b) SQ2 -> SQL (Windows-1252), apenas conversão de encoding (sem compilação).
            for (const sq2Path of sq2Paths) {
                if (token.isCancellationRequested) {
                    return;
                }
                done++;
                progress.report({ increment: step, message: `${done} / ${total} — ${path.basename(sq2Path)}` });
                const result = convertSq2File(sq2Path, convertEncoding);
                if (result.success) {
                    sqlOk++;
                    outputChannel.appendLine(`[OK]  SQ2  ${sq2Path}`);
                } else {
                    sqlFail++;
                    outputChannel.appendLine(`[ERRO] SQ2  ${sq2Path}: ${result.message ?? ''}`);
                }
            }

            // 1c) RPT -> RPA (texto), via GeradorDiferencasRelatorio embarcado (VFP9 + Crystal 11).
            for (const rptPath of rpts) {
                if (token.isCancellationRequested) {
                    return;
                }
                done++;
                progress.report({ increment: step, message: `${done} / ${total} — ${path.basename(rptPath)}` });
                let result;
                try {
                    result = await convertRpt2Rpa(rptPath, context.extensionPath);
                } catch (err) {
                    result = { success: false, message: (err as Error).message };
                }
                if (result.success) {
                    rpaOk++;
                    outputChannel.appendLine(`[OK]  RPT  ${rptPath}`);
                } else {
                    rpaFail++;
                    outputChannel.appendLine(`[ERRO] RPT  ${rptPath}: ${result.message ?? ''}`);
                }
            }

            // 2) FoxBin2Prg -> binários VFP, respeitando a ordem (VC2 antes de SC2),
            //    em uma única sessão do VFP9 por workspace folder.
            if (texts.length > 0) {
                for (const folder of folders) {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    const folderPath = folder.uri.fsPath;
                    const filesInFolder = texts.filter((p) => isUnder(p, folderPath));
                    if (filesInFolder.length === 0) {
                        continue;
                    }

                    const orderedFiles = orderFoxBin2PrgFiles(filesInFolder, vcxOrder);

                    // Progresso por arquivo durante a sessão única do VFP9.
                    const baseDone = done;
                    const onProgress = (processed: number, currentName: string) => {
                        const newDone = baseDone + Math.min(processed, orderedFiles.length);
                        const delta = newDone - done;
                        if (delta > 0) {
                            done = newDone;
                            progress.report({
                                increment: step * delta,
                                message: `${done} / ${total} — ${currentName || 'FoxBin2Prg'}`,
                            });
                        }
                    };

                    report(`FoxBin2Prg em ${folder.name} (${orderedFiles.length} arquivo(s))`);

                    // Marca o instante anterior à geração para detectar binários atualizados.
                    const startTime = Date.now();
                    let res;
                    try {
                        res = await convertFilesOrdered(orderedFiles, context.extensionPath, onProgress);
                    } catch (err) {
                        res = { success: false, count: orderedFiles.length, message: (err as Error).message };
                    }

                    // Reconcilia o contador para o total da pasta (o polling pode perder a última atualização).
                    const finalDone = baseDone + orderedFiles.length;
                    if (finalDone > done) {
                        progress.report({ increment: step * (finalDone - done) });
                        done = finalDone;
                    }

                    if (!res.success) {
                        // Falha da sessão inteira: marca todos os arquivos da pasta como erro.
                        for (const f of orderedFiles) {
                            foxFail++;
                            outputChannel.appendLine(`[ERRO] ${extLabel(f)}  ${f}: ${res.message ?? ''}`);
                        }
                        continue;
                    }

                    // Feedback por arquivo (igual ao PR2), na ordem de compilação.
                    for (const f of orderedFiles) {
                        if (wasGenerated(f, startTime)) {
                            foxOk++;
                            outputChannel.appendLine(`[OK]  ${extLabel(f)}  ${f}`);
                        } else {
                            foxWarn++;
                            outputChannel.appendLine(`[AVISO] ${extLabel(f)}  ${f} (binário não detectado)`);
                        }
                    }
                }
            }
        }
    );

    const summary = `Compilação concluída: PR2 ${pr2Ok} ok / ${pr2Fail} erro(s); SQ2 ${sqlOk} ok / ${sqlFail} erro(s); RPT ${rpaOk} ok / ${rpaFail} erro(s); FoxBin2Prg ${foxOk} ok / ${foxWarn} aviso(s) / ${foxFail} erro(s).`;
    outputChannel.appendLine(summary);
    outputChannel.appendLine('---');
    if (pr2Fail > 0 || sqlFail > 0 || rpaFail > 0 || foxFail > 0 || foxWarn > 0) {
        vscode.window.showWarningMessage(summary);
    } else {
        vscode.window.showInformationMessage(summary);
    }
}

/** Executa o `git` no diretório informado e resolve com stdout e código de saída. */
function runGit(cwd: string, args: string[]): Promise<{ stdout: string; code: number; stderr: string }> {
    return new Promise((resolve) => {
        execFile(
            'git',
            args,
            { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
            (error, stdout, stderr) => {
                const code = error && typeof (error as unknown as { code?: number }).code === 'number'
                    ? (error as unknown as { code: number }).code
                    : (error ? 1 : 0);
                resolve({ stdout: stdout ? String(stdout) : '', code, stderr: stderr ? String(stderr) : '' });
            }
        );
    });
}

/**
 * Coleta os arquivos modificados/criados (working tree + staged) via git, nos
 * repositórios que contêm os workspace folders. Considera M/A/?? — renomeados entram
 * pelo caminho novo (que existe no disco); deletados são ignorados (não existem).
 * Usa `-z` (caminhos crus, sem escapar acentos) e `--no-renames` (1 registro por
 * arquivo, parsing uniforme). Devolve caminhos absolutos.
 */
async function getGitChangedFiles(folders: readonly vscode.WorkspaceFolder[]): Promise<string[]> {
    const roots = new Set<string>();
    for (const folder of folders) {
        const r = await runGit(folder.uri.fsPath, ['rev-parse', '--show-toplevel']);
        if (r.code === 0 && r.stdout.trim()) {
            roots.add(r.stdout.trim());
        }
    }

    const result = new Set<string>();
    for (const root of roots) {
        const r = await runGit(root, ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--no-renames']);
        if (r.code !== 0) {
            continue;
        }
        for (const entry of r.stdout.split('\0')) {
            if (entry.length < 4) {
                continue; // formato de cada registro: "XY <path>"
            }
            const abs = path.resolve(root, entry.slice(3));
            if (fs.existsSync(abs)) {
                result.add(abs);
            }
        }
    }
    return [...result];
}

/**
 * Comando "Compilar arquivos alterados (git)": compila apenas os fontes FoxPro que o
 * git reporta como modificados/criados (working tree + staged). Ideal após edições em
 * lote (ex.: feitas por uma IA) — compila só o que mudou, na ordem de dependência.
 */
async function buildChangedFiles(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage('Abra uma pasta/repositório para compilar.');
        return;
    }

    const config = vscode.workspace.getConfiguration('visualFoxproCompiler');

    let changed: string[];
    try {
        changed = await getGitChangedFiles(folders);
    } catch (err) {
        vscode.window.showErrorMessage(`Falha ao consultar o git: ${(err as Error).message}`);
        return;
    }

    // Diferente do "Compilar todo o repositório", aqui os `.rpt` alterados SEMPRE geram
    // o `.RPA` (independe de `enableRpt2Rpa`): o objetivo é versionar o diff do que mudou.
    const pr2Paths = changed.filter((p) => p.toLowerCase().endsWith('.pr2'));
    const sq2Paths = changed.filter((p) => p.toLowerCase().endsWith('.sq2'));
    const rptPaths = changed.filter((p) => isRptFile(p));
    const textPaths = changed.filter((p) => isFoxBin2PrgText(p));

    if (pr2Paths.length + sq2Paths.length + rptPaths.length + textPaths.length === 0) {
        vscode.window.showInformationMessage('Nenhum fonte FoxPro alterado (.pr2/.sq2/.rpt/.sc2/.vc2/...) segundo o git.');
        return;
    }

    await compileFileSet(
        pr2Paths,
        textPaths,
        sq2Paths,
        rptPaths,
        folders,
        context,
        outputChannel,
        config,
        'Compilando alterados (Visual FoxPro)',
        '=== Compilar arquivos alterados (git) ==='
    );
}

/** Rótulo da extensão em maiúsculas para o log (ex.: `SC2`, `VC2`). */
function extLabel(filePath: string): string {
    return path.extname(filePath).slice(1).toUpperCase();
}

/**
 * Verifica se algum binário esperado para `textPath` existe e foi modificado a
 * partir de `startTime` (tolerância de 2s para resolução de timestamp do sistema).
 */
function wasGenerated(textPath: string, startTime: number): boolean {
    const threshold = startTime - 2000;
    return expectedBinaries(textPath).some((bin) => {
        try {
            return fs.statSync(bin).mtimeMs >= threshold;
        } catch {
            return false;
        }
    });
}

/** Indica se `filePath` está dentro de `dir` (comparação de caminho normalizada). */
function isUnder(filePath: string, dir: string): boolean {
    const rel = path.relative(dir, filePath);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function deactivate() {
    console.log('Extensão desativada.');
}
