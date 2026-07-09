import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { writeSqlFromSq2, writePrgFromPr2 } from '../encoding';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('writeSqlFromSq2: converte UTF-8 -> Windows-1252 e gera .SQL', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfc-sq2-'));
		const sq2Path = path.join(dir, 'CERTTUSPlus.sq2');
		// Conteúdo com acentos: em Windows-1252, 'ç'=0xE7, 'á'=0xE1, 'ã'=0xE3.
		const content = 'CREATE TABLE Configuração (Área varchar);';
		fs.writeFileSync(sq2Path, Buffer.from(content, 'utf8'));

		const result = writeSqlFromSq2(sq2Path, true);
		assert.strictEqual(result.success, true);
		assert.strictEqual(path.basename(result.sqlPath), 'CERTTUSPlus.SQL');
		assert.ok(fs.existsSync(result.sqlPath));

		const bytes = fs.readFileSync(result.sqlPath);
		assert.ok(bytes.includes(0xE7), 'esperado 0xE7 (ç) em Windows-1252');
		assert.ok(bytes.includes(0xE1), 'esperado 0xE1 (á) em Windows-1252');
		assert.ok(bytes.includes(0xE3), 'esperado 0xE3 (ã) em Windows-1252');
		// Não deve conter a sequência multibyte UTF-8 (0xC3 ...).
		assert.ok(!bytes.includes(0xC3), 'não deve conter bytes UTF-8 (0xC3)');

		fs.rmSync(dir, { recursive: true, force: true });
	});

	test('writeSqlFromSq2: sem conversão copia os bytes crus', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfc-sq2raw-'));
		const sq2Path = path.join(dir, 'Modelo.SQ2');
		const buf = Buffer.from('SELECT área;', 'utf8');
		fs.writeFileSync(sq2Path, buf);

		const result = writeSqlFromSq2(sq2Path, false);
		assert.strictEqual(result.success, true);
		assert.strictEqual(path.basename(result.sqlPath), 'Modelo.SQL');
		assert.deepStrictEqual(fs.readFileSync(result.sqlPath), buf);

		fs.rmSync(dir, { recursive: true, force: true });
	});

	test('writePrgFromPr2: continua gerando .prg (regressão do refactor)', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfc-pr2-'));
		const pr2Path = path.join(dir, 'Rotina.pr2');
		fs.writeFileSync(pr2Path, Buffer.from('? "ção"', 'utf8'));

		const result = writePrgFromPr2(pr2Path, true);
		assert.strictEqual(result.success, true);
		assert.strictEqual(path.basename(result.prgPath), 'Rotina.prg');
		const bytes = fs.readFileSync(result.prgPath);
		assert.ok(bytes.includes(0xE7), 'esperado 0xE7 (ç) em Windows-1252');

		fs.rmSync(dir, { recursive: true, force: true });
	});
});
