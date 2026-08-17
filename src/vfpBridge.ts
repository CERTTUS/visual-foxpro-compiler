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
 *
 * O timeout é controlado aqui (e não pela opção `timeout` do `execFile`) para poder
 * descontar o tempo em que o build está pausado: `isPaused` é consultado a cada
 * segundo e, enquanto retornar `true`, o cronômetro não avança. Sem isso, uma pausa
 * longa mataria a sessão do VFP9 que está apenas aguardando.
 */
export function execCscript(
    cwd: string,
    args: string[],
    timeoutMs: number,
    isPaused?: () => boolean
): Promise<{ code: number; stderr: string }> {
    const cscript = resolveCscript();
    const TICK_MS = 1000;
    return new Promise((resolve) => {
        const child = execFile(
            cscript,
            ['//nologo', ...args],
            { cwd, windowsHide: true },
            (error, _stdout, stderr) => {
                clearInterval(watchdog);
                // execFile só popula error.code para exit != 0; sucesso => code 0.
                const code = error && typeof (error as unknown as { code?: number }).code === 'number'
                    ? (error as unknown as { code: number }).code
                    : (error ? 1 : 0);
                resolve({ code, stderr: stderr ? String(stderr) : '' });
            }
        );

        let remaining = timeoutMs;
        const watchdog = setInterval(() => {
            if (isPaused && isPaused()) {
                return; // tempo pausado não conta para o timeout
            }
            remaining -= TICK_MS;
            if (remaining <= 0) {
                clearInterval(watchdog);
                child.kill();
            }
        }, TICK_MS);
    });
}
