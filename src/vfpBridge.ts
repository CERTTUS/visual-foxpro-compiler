import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Ponte com o VFP9 via `cscript` (WScript). Reúne utilitários compartilhados pelos
 * motores embarcados acionados por VBS (FoxBin2Prg e Rpt2Rpa).
 */

/** Localiza o cscript.exe de 32 bits (SysWOW64), com fallback para System32. */
export function resolveCscript(): string {
    const winDir = process.env.windir || process.env.SystemRoot || 'C:\\Windows';
    const wow = path.join(winDir, 'SysWOW64', 'cscript.exe');
    if (fs.existsSync(wow)) {
        return wow;
    }
    return path.join(winDir, 'System32', 'cscript.exe');
}

/**
 * Executa o cscript (com `//nologo`) a partir de `cwd`, com os argumentos dados, e
 * resolve com o código de saída e o stderr do processo (nunca rejeita).
 */
export function execCscript(
    cwd: string,
    args: string[],
    timeoutMs: number
): Promise<{ code: number; stderr: string }> {
    const cscript = resolveCscript();
    return new Promise((resolve) => {
        execFile(
            cscript,
            ['//nologo', ...args],
            { cwd, windowsHide: true, timeout: timeoutMs },
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
