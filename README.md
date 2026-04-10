# Compilador Visual FoxPro (PR2)

Ao salvar um arquivo **`.pr2`**, a extensão gera o **`.prg`** com o mesmo nome (opcionalmente convertendo de UTF-8 para Windows-1252) e compila para **`.FXP`**.

![Captura do compilador](image1.png)

## Configuração

- **visualFoxproCompiler.convertEncodingBeforeCompile** — Se ativado, o conteúdo UTF-8 do `.pr2` é gravado no `.prg` em Windows-1252. Se desativado, os bytes são copiados sem conversão.

## Requisitos

- Windows (win32)
- Visual FoxPro 9 (binários do compilador incluídos na extensão)
