# Compilador Visual FoxPro (PR2 + FoxBin2Prg)

A extensão atua ao salvar arquivos, conforme a extensão:

- **`.pr2`** → gera o **`.prg`** com o mesmo nome (opcionalmente convertendo de UTF-8 para Windows-1252) e compila para **`.FXP`** com o compilador VFP embarcado.
- **`.sq2`** → gera o **`.SQL`** com o mesmo nome/diretório, convertendo de UTF-8 para Windows-1252. É a modelagem do banco PostgreSQL lida pelo VFP9 em runtime. **Não há compilação** — a conversão de encoding é o único passo, análoga ao par `.pr2`/`.prg`. Edite o `.sq2` (UTF-8, legível por qualquer editor) e versione tanto o `.sq2` quanto o `.SQL` gerado.
- **`.sc2` / `.vc2` / `.fr2` / `.lb2` / `.mn2` / `.pj2` / `.dc2`** → gera os binários VFP correspondentes (**PRG2BIN**) usando o **FoxBin2Prg** embarcado, acionado pelo Visual FoxPro 9 instalado (automação COM):

  | Texto | Binários gerados | Uso |
  |-------|------------------|-----|
  | `.sc2` | `.scx` / `.sct` | Formulários |
  | `.vc2` | `.vcx` / `.vct` | Bibliotecas de classes |
  | `.fr2` | `.frx` / `.frt` | Relatórios |
  | `.lb2` | `.lbx` / `.lbt` | Labels |
  | `.mn2` | `.mnx` / `.mnt` | Menus |
  | `.pj2` | `.pjx` / `.pjt` | Projetos |
  | `.dc2` | `.dbc` / `.dct` / `.dcx` | Bancos de dados |

Além disso, nos comandos de compilação (repositório/alterados):

- **`.rpt`** (relatórios do **Crystal Reports**) → gera o **`.RPA`** (arquivo texto) de mesmo nome/diretório, usando o `GeradorDiferencasRelatorio` embarcado, acionado pelo Visual FoxPro 9 (COM). O `.RPA` permite versionar e comparar (diff) os relatórios binários no controle de versão. **Não há gatilho ao salvar** — o `.rpt` é binário; a geração ocorre apenas nos comandos de build. **Desativado por padrão** (ver `enableRpt2Rpa`), por exigir Crystal Reports e banco (ver [Requisitos](#requisitos)).

![Captura do compilador](image1.png)

## Compilar todo o repositório

Para quem clonou um repositório contendo **apenas os fontes** (texto) e precisa gerar os binários:

- Abra **Configurações** → busque por `Visual FoxPro` e clique no link **“Compilar todo o repositório agora”**; ou
- Rode o comando **`Visual FoxPro: Compilar todo o repositório (gerar binários)`** na paleta de comandos (`Ctrl+Shift+P`).

A ação varre o(s) workspace folder(s), gera `PRG`+`FXP` de todos os `.pr2`, os `.SQL` de todos os `.sq2` e os binários VFP (`SCX/VCX/FRX…`) de todos os textos FoxBin2Prg, mostrando o progresso e o resultado por arquivo no Output. Binários existentes são sobrescritos (há confirmação, controlável pela configuração `confirmBuildRepository`). O comando **`Visual FoxPro: Compilar arquivos alterados (git)`** (`Ctrl+Shift+Alt+S`) faz o mesmo apenas para os fontes modificados/criados segundo o git — incluindo os `.sq2`.

> **CONST.FXP**: antes de compilar os PR2 (tanto no build quanto ao salvar um `.pr2`), a extensão verifica se o `CONST.FXP` existe na raiz do repositório. Se não existir e houver um `CONST.PR2`, ele é compilado primeiro — assim os PR2 que fazem `#INCLUDE CONST.PRG` não falham por constantes ausentes.

> **Ordem das classes/formulários**: no build, as `VC2` (classes) são geradas **antes** das `SC2` (formulários), pois os formulários incorporam as classes. Entre as bibliotecas `VC2`, a ordem segue a configuração `visualFoxproCompiler.vcxBuildOrder` (padrão: `vclFormularios`, `vclComponentesBasicos`, `vclComponentesIntegrados`); as demais `VC2` seguem em ordem alfabética e o `PJ2` (projeto) é processado por último. Tudo numa única sessão do VFP9 por pasta.

## Configuração

- **visualFoxproCompiler.convertEncodingBeforeCompile** — Se ativado, o conteúdo UTF-8 do `.pr2` é gravado no `.prg` (e o do `.sq2` no `.SQL`) em Windows-1252. Se desativado, os bytes são copiados sem conversão.
- **visualFoxproCompiler.enableFoxBin2Prg** — Ativa a geração de binários VFP (PRG2BIN) ao salvar arquivos de texto FoxBin2Prg. Padrão: ativado.
- **visualFoxproCompiler.enableRpt2Rpa** — Nos comandos de build (repositório/alterados), gera o `.RPA` (texto) de cada relatório Crystal Reports (`.rpt`) via VFP9 + Crystal 11. Padrão: **desativado** (requer Crystal Reports e banco — ver Requisitos).
- **visualFoxproCompiler.foxBin2PrgUtf8** — Trata os arquivos de texto FoxBin2Prg como UTF-8: converte para Windows-1252 apenas durante o PRG2BIN e mantém o arquivo em UTF-8 no disco. Padrão: ativado.
- **visualFoxproCompiler.confirmBuildRepository** — Pede confirmação antes de compilar todo o repositório. Padrão: ativado. (A descrição desta configuração contém o link para acionar a compilação.)
- **visualFoxproCompiler.vcxBuildOrder** — Ordem de compilação das bibliotecas de classes (VC2), por nome. Padrão: `vclFormularios`, `vclComponentesBasicos`, `vclComponentesIntegrados`.

## Requisitos

- Windows (win32)
- **Visual FoxPro 9 instalado** na máquina. O fluxo `.pr2` usa os binários do compilador incluídos na extensão; o fluxo FoxBin2Prg aciona o VFP9 via automação COM (`VisualFoxPro.Application.9`) rodando o `foxbin2prg.prg` embarcado em `bin/foxbin2prg`.
- **Fluxo `.rpt` → `.RPA` (opcional, `enableRpt2Rpa`)** — além do VFP9, exige:
  - **Crystal Reports XI (11)** instalado e registrado (`CrystalRuntime.Application.11`);
  - um arquivo **`CFG\CONEXAO.MEM`** acessível a partir da pasta do `.rpt` (o gerador sobe na árvore de diretórios procurando-o), contendo `conn_IP`/`conn_DB`;
  - conexão **PostgreSQL** ativa — a seção de SQL do relatório é resolvida contra o banco (via ODBC, DSN `C:\CERTTUS\CERTTUS.dsn` reescrito pelo gerador).

  O gerador (`bin/rpt2rpa/GeradorDiferencasRelatorio.FXP`) é uma cópia embarcada do `GeradorDiferencasRelatorio.PRG` adaptada para automação headless (sem `MESSAGEBOX` bloqueante; erros gravados e reportados no Output). O `.RPA` inclui a linha `PrintDate` (data da geração), que aparecerá como diferença a cada execução.

## Créditos

A conversão de binários VFP usa o [FoxBin2Prg](https://github.com/CERTTUS/foxbin2prg) (fork CERTTUS) embarcado na extensão.
