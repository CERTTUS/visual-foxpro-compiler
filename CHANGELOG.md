# Change Log


## [1.2.0]

- Feat: novo fluxo **`.sq2` → `.SQL`**. Ao salvar um arquivo `.sq2` (modelagem do banco PostgreSQL editável em UTF-8), gera o `.SQL` de mesmo nome/diretório convertendo UTF-8 → Windows-1252 (o encoding lido pelo VFP9 em runtime). **Não há compilação** — é apenas conversão de encoding, análoga ao par `.pr2`/`.prg`, resolvendo o problema de editores (ex.: Cursor) que não interpretam corretamente o Windows-1252. A extensão de destino é sempre maiúscula (`.SQL`) para casar com os arquivos versionados. Usa a configuração existente `convertEncodingBeforeCompile`.
- Feat: os comandos **Compilar todo o repositório** e **Compilar arquivos alterados (git)** passam a gerar também os `.SQL` de todos os `.sq2` (com feedback por arquivo e no resumo).
- Ativação: adicionado `workspaceContains:**/*.sq2` para garantir a ativação da extensão em repositórios com `.sq2` mesmo sem arquivos FoxPro abertos.
- Refactor: extraído o núcleo comum `writeConverted` em `src/encoding.ts`, compartilhado por `writePrgFromPr2` e pelo novo `writeSqlFromSq2`.

## [1.1.6]

- Feat: novo comando **`Visual FoxPro: Compilar arquivos alterados (git)`** (`visualFoxproCompiler.buildChangedFiles`). Compila apenas os fontes que o git reporta como modificados/criados (working tree + staged: M/A/??), na ordem de dependência (CONST → PR2 → VC2 antes de SC2, em uma única sessão do VFP9). Resolve o caso de arquivos alterados fora do editor (ex.: por uma IA/script), que não disparam o `onDidSaveTextDocument`. Atalho padrão **`Ctrl+Shift+Alt+S`** (livre por padrão, não sobrescreve atalho nativo e sem o problema do AltGr em teclado ABNT2; pode ser alterado em `keybindings.json`); também disponível na paleta de comandos. Usa `git status --porcelain -z --no-renames` (suporta caminhos com acento).
- Refactor: extraído o núcleo `compileFileSet` compartilhado entre "Compilar todo o repositório" e o novo comando.

## [1.1.5]

- Feat: a conversão de encoding UTF-8 → Windows-1252 do PRG2BIN passou a ser feita **em memória pelo próprio motor FoxBin2Prg**, não mais pela extensão. Foi adicionado o método `readSourceText` em `bin/foxbin2prg/foxbin2prg.prg` (classe `c_conversor_base`), que ao ler cada fonte (SC2/VC2/FR2/...) detecta UTF-8 pelo BOM ou por round-trip estável (`STRCONV` 11/9) e converte para o codepage atual; arquivos já em Windows-1252/ANSI passam intactos. A extensão deixou de gerar arquivo temporário ou alterar o arquivo em disco — o `.sc2` aberto no editor nunca é tocado. Comportamento validado contra o VFP9 real (`.fxp` recompilado).
- A configuração `visualFoxproCompiler.foxBin2PrgUtf8` foi marcada como obsoleta (a conversão agora é automática e não a utiliza mais).

## [1.1.4]

- Fix: ao salvar um texto FoxBin2Prg (.sc2/.vc2/.fr2/...), a conversão UTF-8 → Windows-1252 deixa de ser feita in-place no arquivo aberto. Agora ela ocorre em um arquivo temporário no mesmo diretório (preservando `#INCLUDE` relativo); os binários gerados são renomeados para o nome real e o temporário é removido. Elimina o "flicker" de encoding no editor e o risco de perder edições feitas durante a janela de compilação. Quando não há conversão de encoding, o PRG2BIN roda direto sobre o original.

## [1.1.3]

- Feat: a validação do CONST passa a valer também ao salvar arquivos FoxBin2Prg (.sc2/.vc2/.fr2/...), pois eles também fazem `#INCLUDE CONST.PRG`. Antes de gerar o binário, garante o `CONST.FXP` na raiz (compilando o `CONST.PR2` se faltar). No build, o CONST já era garantido no passo 0.

## [1.1.2]

- Feat: a barra de progresso do "Compilar todo o repositório" agora considera todos os arquivos (PR2 + FoxBin2Prg) e exibe um contador `X / Total`. O progresso do FoxBin2Prg é reportado por arquivo em tempo real durante a sessão única do VFP9 (via arquivo de status do Run-Bin2PrgList-VFP9.vbs).

## [1.1.1]

- Fix: embarca os arquivos de runtime do FoxBin2Prg que faltavam (`props_*.txt` e `foxbin2prg_keywords.dbf/.cdx`). Sem eles, o PRG2BIN falhava com "Error 1, File does not exist" em `sortspecialprops` (props_all.txt).

## [1.1.0]

- Feat: ao salvar arquivos de texto FoxBin2Prg (.sc2/.vc2/.fr2/.lb2/.mn2/.pj2/.dc2), gera os binários VFP correspondentes (PRG2BIN) via FoxBin2Prg embarcado, acionando o Visual FoxPro 9 instalado (COM).
- Feat: comando `Visual FoxPro: Compilar todo o repositório (gerar binários)` — varre o workspace e gera PRG/FXP de todos os .pr2 e os binários VFP de todos os textos FoxBin2Prg (com barra de progresso e confirmação, e feedback por arquivo no Output). Acionável também por um link na tela de Configurações.
- Feat: antes de compilar os PR2 (no build e ao salvar), garante que o `CONST.FXP` exista na raiz do repositório; se faltar, compila o `CONST.PR2` primeiro (evita erros em PR2 que fazem `#INCLUDE CONST.PRG`).
- Feat: no build, respeita a ordem de dependência ao gerar binários FoxBin2Prg — VC2 (classes) antes de SC2 (formulários), com a ordem das bibliotecas VC2 configurável (`vcxBuildOrder`); PJ2 por último. Processado numa única sessão do VFP9 por pasta (Run-Bin2PrgList-VFP9.vbs embarcado).
- Nova configuração `visualFoxproCompiler.vcxBuildOrder` (padrão: vclFormularios, vclComponentesBasicos, vclComponentesIntegrados).
- Conversão de encoding UTF-8 → Windows-1252 durante o PRG2BIN, mantendo o arquivo de texto em UTF-8 no disco (config `foxBin2PrgUtf8`).
- Novas configurações: `visualFoxproCompiler.enableFoxBin2Prg`, `visualFoxproCompiler.foxBin2PrgUtf8` e `visualFoxproCompiler.confirmBuildRepository`.
- Motor FoxBin2Prg embarcado em `bin/foxbin2prg`. O fluxo PR2 → PRG → FXP permanece inalterado.

## [1.0.9]

- bug fix: Errors were not displayed for files with names in non-lowercase letters

## [1.0.4]

- Throw compilation error if cannot create fxp file


## [Unreleased]

- Initial release

