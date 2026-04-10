import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';

/** Indica se o buffer é UTF-8 válido (com ou sem BOM UTF-8). */
function isUtf8(buffer: Buffer): boolean {
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return true;
    }
    const decoded = buffer.toString('utf8');
    return !decoded.includes('\uFFFD');
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

    try {
        const buffer = fs.readFileSync(pr2Path);

        if (!convertEncoding) {
            fs.writeFileSync(prgPath, buffer, { flag: 'w' });
            return { success: true, prgPath };
        }

        if (buffer.length === 0) {
            fs.writeFileSync(prgPath, Buffer.alloc(0), { flag: 'w' });
            return { success: true, prgPath };
        }

        const outBuffer = isUtf8(buffer)
            ? iconv.encode(buffer.toString('utf8'), 'win1252')
            : buffer;

        fs.writeFileSync(prgPath, outBuffer, { flag: 'w' });
        return { success: true, prgPath };
    } catch (err) {
        const message = (err as Error).message;
        return { success: false, prgPath, message };
    }
}
