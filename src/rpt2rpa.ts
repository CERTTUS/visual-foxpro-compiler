import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execCscript } from './vfpBridge';

/**
 * Gera arquivos texto `.RPA` a partir de relatórios do Crystal Reports (`.RPT`),
 * executando o GeradorDiferencasRelatorio embarcado (`bin/rpt2rpa`) via VFP9 (COM).
 *
 * Requisitos externos (não embarcáveis): Visual FoxPro 9 registrado e Crystal Reports
 * XI (11) registrado (`CrystalRuntime.Application.11`). A seção de SQL do relatório
 * consulta o banco via ODBC, exigindo `CFG\CONEXAO.MEM` (a partir da pasta do `.RPT`)
 * e conexão PostgreSQL ativa.
 */

/** Indica se `filePath` é um relatório Crystal Reports (`.rpt`). */
export function isRptFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.rpt';
}

/** Caminho do `.RPA` (texto, maiúsculo) esperado para `rptPath` — mesmo nome/diretório. */
export function expectedRpa(rptPath: string): string {
    const parsed = path.parse(rptPath);
    return path.join(parsed.dir, parsed.name + '.RPA');
}

export interface Rpt2RpaResult {
    success: boolean;
    /** Caminho do `.RPA` gerado, quando existe (para log). */
    output?: string;
    message?: string;
}

/** Caminho do motor embarcado e o VBS de ponte com o VFP9. */
function enginePaths(extensionPath: string): { foxPath: string; vbs: string } {
    const foxPath = path.join(extensionPath, 'bin', 'rpt2rpa');
    return { foxPath, vbs: path.join(foxPath, 'Run-Rpt2Rpa-VFP9.vbs') };
}

/**
 * Converte um `.rpt` para o `.RPA` correspondente, acionando o VFP9 (COM) e o
 * GeradorDiferencasRelatorio embarcado. O motor grava as mensagens de erro num arquivo
 * de status temporário (usado na mensagem de falha). O `.rpt` de origem não é alterado.
 */
export async function convertRpt2Rpa(
    rptPath: string,
    extensionPath: string
): Promise<Rpt2RpaResult> {
    if (!isRptFile(rptPath)) {
        return { success: false, message: `Extensão não suportada: ${path.extname(rptPath)}` };
    }

    const { foxPath, vbs } = enginePaths(extensionPath);
    if (!fs.existsSync(vbs)) {
        return { success: false, message: `Motor Rpt2Rpa não encontrado: ${vbs}` };
    }

    const stamp = `${process.pid}_${Date.now()}`;
    const statusFile = path.join(os.tmpdir(), `rpt2rpa_status_${stamp}.txt`);

    try {
        // Timeout amplo: Crystal + consulta ao banco podem ser lentos. Relatórios
        // grandes (muitos subrelatórios/objetos) podem levar dezenas de minutos, pois
        // o gerador avalia cada objeto/campo via COM contra o banco. Caso real medido:
        // ~28 min para um relatório com 18 subrelatórios (RPA de ~930 KB). 40 min de folga.
        const { code, stderr } = await execCscript(foxPath, [vbs, rptPath, statusFile], 2400000);

        let statusMsg = '';
        try {
            if (fs.existsSync(statusFile)) {
                statusMsg = fs.readFileSync(statusFile, 'latin1').trim();
            }
        } catch {
            /* ignora leitura do status */
        }

        if (code !== 0) {
            const detail = statusMsg || stderr;
            return {
                success: false,
                message: `Rpt2Rpa retornou código ${code}${detail ? `\n${detail}` : ''}`,
            };
        }

        const rpaPath = expectedRpa(rptPath);
        const output = fs.existsSync(rpaPath) ? rpaPath : undefined;
        return { success: true, output };
    } finally {
        try {
            fs.unlinkSync(statusFile);
        } catch {
            /* ignora falha ao remover o temporário */
        }
    }
}
