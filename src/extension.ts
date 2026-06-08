import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { writePrgFromPr2 } from './encoding';
import {
    convertPrg2Bin,
    convertFilesOrdered,
    orderFoxBin2PrgFiles,
    expectedBinaries,
    isFoxBin2PrgText,
    FOXBIN2PRG_TEXT_EXTENSIONS,
} from './foxbin2prg';

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

        if (config.get<boolean>('enableFoxBin2Prg', true) && isFoxBin2PrgText(document.fileName)) {
            await runFoxBin2Prg(document, context, outputChannel, config);
            return;
        }
    });

    const buildCmd = vscode.commands.registerCommand(
        'visualFoxproCompiler.buildWorkspace',
        () => buildWorkspace(context, outputChannel)
    );

    context.subscriptions.push(disposable, buildCmd, outputChannel);
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

    const convertUtf8 = config.get<boolean>('foxBin2PrgUtf8', true);

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
        result = await convertPrg2Bin(textPath, context.extensionPath, convertUtf8);
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
    const convertEncoding = config.get<boolean>('convertEncodingBeforeCompile', true);
    const enableFoxBin2Prg = config.get<boolean>('enableFoxBin2Prg', true);
    const convertUtf8 = config.get<boolean>('foxBin2PrgUtf8', true);
    const confirm = config.get<boolean>('confirmBuildRepository', true);
    const vcxOrder = config.get<string[]>('vcxBuildOrder', DEFAULT_VCX_ORDER);

    const exclude = '**/{node_modules,.git,foxbin2prg}/**';
    const pr2Uris = await vscode.workspace.findFiles('**/*.{pr2,PR2}', exclude);
    const textUris = enableFoxBin2Prg
        ? await vscode.workspace.findFiles(`**/*.{${foxBin2PrgGlobExts()}}`, exclude)
        : [];

    const total = pr2Uris.length + textUris.length;
    if (total === 0) {
        vscode.window.showInformationMessage('Nenhum fonte FoxPro (.pr2/.sc2/.vc2/...) encontrado no repositório.');
        return;
    }

    if (confirm) {
        const pick = await vscode.window.showWarningMessage(
            `Compilar todo o repositório? Serão processados ${pr2Uris.length} arquivo(s) .pr2 e ${textUris.length} texto(s) FoxBin2Prg. Binários existentes serão sobrescritos.`,
            { modal: true },
            'Compilar'
        );
        if (pick !== 'Compilar') {
            return;
        }
    }

    const compilerPath = path.join(context.extensionPath, 'bin', 'visual-foxpro-compiler.exe');

    outputChannel.appendLine('=== Compilar todo o repositório ===');
    outputChannel.show(true);

    let pr2Ok = 0;
    let pr2Fail = 0;
    let foxOk = 0;
    let foxWarn = 0;
    let foxFail = 0;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Compilando repositório (Visual FoxPro)',
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
            for (const uri of pr2Uris) {
                if (token.isCancellationRequested) {
                    return;
                }
                const pr2Path = uri.fsPath;
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

            // 2) FoxBin2Prg -> binários VFP, respeitando a ordem (VC2 antes de SC2),
            //    em uma única sessão do VFP9 por workspace folder.
            if (enableFoxBin2Prg && textUris.length > 0) {
                for (const folder of folders) {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    const folderPath = folder.uri.fsPath;
                    const filesInFolder = textUris
                        .map((u) => u.fsPath)
                        .filter((p) => isUnder(p, folderPath));
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
                        res = await convertFilesOrdered(orderedFiles, context.extensionPath, convertUtf8, onProgress);
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

    const summary = `Repositório compilado: PR2 ${pr2Ok} ok / ${pr2Fail} erro(s); FoxBin2Prg ${foxOk} ok / ${foxWarn} aviso(s) / ${foxFail} erro(s).`;
    outputChannel.appendLine(summary);
    outputChannel.appendLine('---');
    if (pr2Fail > 0 || foxFail > 0 || foxWarn > 0) {
        vscode.window.showWarningMessage(summary);
    } else {
        vscode.window.showInformationMessage(summary);
    }
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
