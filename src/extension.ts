import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { writePrgFromPr2 } from './encoding';

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

    const disposable = vscode.workspace.onDidSaveTextDocument((document) => {
        if (!document.fileName.toLowerCase().endsWith('.pr2')) {
            return;
        }

        const pr2Path = document.fileName;
        console.log(`PR2 salvo: ${pr2Path}`);
        const compilerPath = path.join(context.extensionPath, 'bin', 'visual-foxpro-compiler.exe');

        const config = vscode.workspace.getConfiguration('visualFoxproCompiler');
        const convertEncoding = config.get<boolean>('convertEncodingBeforeCompile', true);

        const writeResult = writePrgFromPr2(pr2Path, convertEncoding);
        if (!writeResult.success) {
            const msg = `Falha ao gerar .prg: ${writeResult.message}`;
            outputChannel.appendLine(msg);
            outputChannel.appendLine('---');
            outputChannel.show(true);
            vscode.window.showErrorMessage(msg);
            return;
        }

        const prgPath = writeResult.prgPath;
        outputChannel.appendLine(
            convertEncoding
                ? `Gerado ${prgPath} (UTF-8 → Windows-1252) a partir de ${pr2Path}`
                : `Copiado para ${prgPath} (sem conversão de codificação) a partir de ${pr2Path}`
        );

        const errorFilePath = path.format({ ...path.parse(prgPath), base: undefined, ext: '.err' });

        execFile(compilerPath, [prgPath], (error, _stdout, stderr) => {
            outputChannel.appendLine(`Compilar ${prgPath}:`);

            if (error) {
                const errorMessage = `Erro ao executar o compilador: ${error.message}${stderr ? `\n${stderr}` : ''}`;
                console.error(errorMessage);
                outputChannel.appendLine(errorMessage);
                outputChannel.appendLine('---');
                vscode.window.showErrorMessage('Erro ao executar o compilador.');
                outputChannel.show(true);
                return;
            }

            if (fs.existsSync(errorFilePath)) {
                try {
                    vscode.window.setStatusBarMessage('Erro(s) de compilação.', 5000);
                    outputChannel.appendLine('Erro de compilação:');
                    outputChannel.appendLine(fs.readFileSync(errorFilePath, 'utf8'));
                    outputChannel.appendLine('---');
                    outputChannel.show(true);
                    fs.unlinkSync(errorFilePath);
                } catch (err) {
                    const errorMessage = `Erro ao abrir o arquivo .err: ${(err as Error).message}`;
                    console.error(errorMessage);
                    outputChannel.appendLine(errorMessage);
                    outputChannel.appendLine('---');
                    vscode.window.showErrorMessage('Erro ao abrir o arquivo de erros.');
                    outputChannel.show(true);
                }
            } else {
                ensureFxpCase(prgPath);
                console.log('Compilação concluída com sucesso.');
                outputChannel.appendLine('Compilação concluída com sucesso.');
                outputChannel.appendLine('---');
                vscode.window.setStatusBarMessage('Compilação concluída', 10000);
            }
        });
    });

    context.subscriptions.push(disposable, outputChannel);
}

export function deactivate() {
    console.log('Extensão desativada.');
}
