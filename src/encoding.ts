import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';

/** Indica se o buffer é UTF-8 válido (com ou sem BOM UTF-8). */
export function isUtf8(buffer: Buffer): boolean {
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return true;
    }
    const decoded = buffer.toString('utf8');
    return !decoded.includes('\uFFFD');
}

/**
 * Núcleo de conversão de encoding: lê `srcPath` e grava `targetPath` (sobrescreve se
 * existir). Com conversão: UTF-8 → Windows-1252; se não for UTF-8 válido, copia os bytes
 * sem alterar. Sem conversão: copia o buffer integralmente.
 */
function writeConverted(
    srcPath: string,
    targetPath: string,
    convertEncoding: boolean
): { success: boolean; targetPath: string; message?: string } {
    try {
        const buffer = fs.readFileSync(srcPath);

        if (!convertEncoding) {
            fs.writeFileSync(targetPath, buffer, { flag: 'w' });
            return { success: true, targetPath };
        }

        if (buffer.length === 0) {
            fs.writeFileSync(targetPath, Buffer.alloc(0), { flag: 'w' });
            return { success: true, targetPath };
        }

        const outBuffer = isUtf8(buffer)
            ? iconv.encode(buffer.toString('utf8'), 'win1252')
            : buffer;

        fs.writeFileSync(targetPath, outBuffer, { flag: 'w' });
        return { success: true, targetPath };
    } catch (err) {
        const message = (err as Error).message;
        return { success: false, targetPath, message };
    }
}

/**
 * Lê o `.pr2` salvo e grava `mesmoNome.prg` no mesmo diretório (sobrescreve se existir).
 * Com conversão: UTF-8 → Windows-1252; se não for UTF-8 válido, copia os bytes sem alterar.
 * Sem conversão: copia o buffer integralmente para o `.prg`.
 */
export function writePrgFromPr2(
    pr2Path: string,
    convertEncoding: boolean
): { success: boolean; prgPath: string; message?: string } {
    const parsed = path.parse(pr2Path);
    const prgPath = path.join(parsed.dir, parsed.name + '.prg');
    const result = writeConverted(pr2Path, prgPath, convertEncoding);
    return { success: result.success, prgPath, message: result.message };
}

/**
 * Lê o `.sq2` salvo (modelagem PostgreSQL editável em UTF-8) e grava `mesmoNome.SQL` no
 * mesmo diretório (sobrescreve se existir), convertendo UTF-8 → Windows-1252 quando ativado.
 * A extensão de destino é sempre maiúscula (`.SQL`) para casar com os arquivos versionados
 * lidos pelo VFP9. Não há compilação: o `.SQL` é o produto final.
 */
export function writeSqlFromSq2(
    sq2Path: string,
    convertEncoding: boolean
): { success: boolean; sqlPath: string; message?: string } {
    const parsed = path.parse(sq2Path);
    const sqlPath = path.join(parsed.dir, parsed.name + '.SQL');
    const result = writeConverted(sq2Path, sqlPath, convertEncoding);
    return { success: result.success, sqlPath, message: result.message };
}
