# Change Log


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

