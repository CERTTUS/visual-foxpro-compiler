import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { writeSqlFromSq2, writePrgFromPr2 } from '../encoding';
import { getIncludeDependencies, getIncludeTargetPath, materializeIncludes } from '../includes';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('writeSqlFromSq2: converte UTF-8 -> Windows-1252 e gera .SQL', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfc-sq2-'));
		const sq2Path = path.join(dir, 'CERTTUSPlus.sq2');
		// Conteúdo com acentos: em Windows-1252, 'ç'=0xE7, 'ã'=0xE3, 'Á'=0xC1.
		const content = 'CREATE TABLE Configuração (Área varchar);';
		fs.writeFileSync(sq2Path, Buffer.from(content, 'utf8'));

		const result = writeSqlFromSq2(sq2Path, true);
		assert.strictEqual(result.success, true);
		assert.strictEqual(path.basename(result.sqlPath), 'CERTTUSPlus.SQL');
		assert.ok(fs.existsSync(result.sqlPath));

		const bytes = fs.readFileSync(result.sqlPath);
		assert.ok(bytes.includes(0xE7), 'esperado 0xE7 (ç) em Windows-1252');
		// "Área" tem Á MAIÚSCULO (0xC1); o teste original checava 0xE1 (á minúsculo),
		// que não existe nesse conteúdo — falhava desde que foi escrito.
		assert.ok(bytes.includes(0xC1), 'esperado 0xC1 (Á) em Windows-1252');
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

	test('getIncludeDependencies: reconhece os formatos encontrados nos fontes', () => {
		// Amostras reais de .sc2/.vc2/.pr2 do ERP: diretiva indentada com tabs, espaço
		// entre '#' e 'INCLUDE', caminho relativo entre aspas e sem extensão.
		const fonte = [
			'\t\t   # INCLUDE CONST.PRG',
			'#INCLUDE "..\\..\\cselecionados"',
			'#include <foxpro.h>',
			'\t#INCLUDE ..\\CONST.PRG',
			'* #INCLUDE naoconta.prg',          // comentário VFP: não é diretiva
			'x = "#INCLUDE embutido.prg"',      // dentro de string: idem
		].join('\r\n');

		const deps = getIncludeDependencies(fonte);
		assert.ok(deps.includes('CONST.PRG'), 'diretiva indentada com espaço após #');
		assert.ok(deps.includes('..\\..\\cselecionados'), 'caminho entre aspas, sem extensão');
		assert.ok(deps.includes('foxpro.h'), 'delimitado por < >');
		assert.ok(deps.includes('..\\CONST.PRG'), 'caminho relativo');
		assert.ok(!deps.includes('naoconta.prg'), 'linha comentada não é diretiva');
		assert.ok(!deps.includes('embutido.prg'), 'ocorrência dentro de string não conta');
	});

	test('getIncludeTargetPath: resolve relativo à pasta do fonte', () => {
		const base = path.join('C:', 'repo', 'Comercial');
		assert.strictEqual(
			getIncludeTargetPath('..\\CONST.PRG', base).toLowerCase(),
			path.join('C:', 'repo', 'CONST.PRG').toLowerCase()
		);
		assert.strictEqual(
			getIncludeTargetPath('CONST.PRG', base).toLowerCase(),
			path.join(base, 'CONST.PRG').toLowerCase()
		);
	});

	test('materializeIncludes: gera o .PRG no caminho exato da diretiva', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfc-inc-'));
		const sub = path.join(dir, 'Comercial');
		fs.mkdirSync(sub);
		// CONST.PR2 na raiz; o fonte está na subpasta e aponta '..\CONST.PRG'.
		fs.writeFileSync(path.join(dir, 'CONST.PR2'), Buffer.from('#DEFINE ACAO "inclusão"', 'utf8'));
		const sc2 = path.join(sub, 'Pedido.sc2');
		fs.writeFileSync(sc2, Buffer.from('\t\t# INCLUDE ..\\CONST.PRG\r\n', 'utf8'));

		const r = materializeIncludes(sc2, true, dir);
		const esperado = path.join(dir, 'CONST.PRG');
		assert.deepStrictEqual(r.naoResolvidos, [], 'nada deveria ficar sem resolver');
		assert.ok(fs.existsSync(esperado), 'CONST.PRG deve nascer uma pasta acima do fonte');
		assert.ok(
			fs.readFileSync(esperado).includes(0xE3),
			'esperado 0xE3 (ã) — conversão para Windows-1252'
		);

		// Idempotência: já existindo, não é recriado nem reportado.
		const r2 = materializeIncludes(sc2, true, dir);
		assert.deepStrictEqual(r2.criados, [], 'arquivo existente não deve ser sobrescrito');

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
