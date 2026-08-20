# Change Log


## [1.7.1]

- Fix: no comando **Compilar arquivos alterados (git)**, o `.vbproj` de um arquivo .NET era procurado sempre a partir do primeiro workspace folder. Em workspace com múltiplas pastas, um `.vb` alterado na segunda pasta não tinha seu projeto encontrado — a busca subia a árvore errada. A raiz passa a ser resolvida por arquivo.
- Fix: `#INCLUDE` **sem extensão** (`#INCLUDE "....cselecionados"`, presente nos fontes) era sempre reportado como não resolvido. Agora um `.h` ou `.prg` ao lado satisfaz a diretiva — é o que o VFP procura quando a extensão é omitida — e, quando é preciso materializar, o arquivo nasce como `.prg` em vez de sem extensão.
- Testes: cobertura da detecção de `#INCLUDE` com os formatos reais dos fontes (indentado, espaço após o `#`, entre aspas, entre `< >`, sem extensão, e as ocorrências que **não** são diretiva) e da materialização no caminho exato da diretiva.
- Fix: o teste `writeSqlFromSq2` verificava o byte `0xE1` (á minúsculo) num conteúdo que só tem `Á` maiúsculo (`0xC1`) — falhava desde que foi escrito, na v1.2.0. A suíte agora passa inteira (7 casos).

## [1.7.0]

Auditoria de paridade com o `vfp-compiler-installer` (que não foi alterado). Cada item abaixo espelha uma rotina de lá.

### Build do EXE (`.pj2`) — correção importante

- **Guarda de auto-include removida.** A referência tem dois modos: `Invoke-VfpExeSparseLote` (workspace sparse + guarda) apenas **valida que compila** — o EXE dele **não roda**, porque a guarda exclui auto-includes que são dependências necessárias; e `Invoke-VfpExeFullBuild` (working tree completo, **sem** guarda), que gera o EXE utilizável. A extensão builda in-place, ou seja, é o segundo caso, mas aplicava a guarda do primeiro — e ainda persistia as exclusões no `.pj2` do desenvolvedor. Agora segue o `FullBuild`, e o `.pj2` é sempre restaurado ao final.
- **Refs `.ADD` stale** (`Repair-Pj2BrokenAdds`): referências cujo arquivo não existe — nem o binário, nem o texto FoxBin de origem — são ignoradas no build. Uma única ref quebrada gera EXE defeituoso (menus que não instanciam) ou centenas de diálogos *Locate File* até o timeout.
- **Fecho de dependências** (`Get-Pj2DependencyClosure` + `Build-Pj2BinarySet`): o repositório versiona os textos, não os binários. Antes do `BUILD EXE`, o fecho é percorrido em largura a partir dos `.ADD` — seguindo `SET CLASSLIB`, `DO FORM`, classe-pai e nomes citados — e os binários faltantes ou desatualizados são regenerados, com cache por data de modificação.

### `#INCLUDE` (`.pr2` e textos FoxBin2Prg)

- Novo `src/includes.ts`, espelhando `New-IncludesMaterializados`: cada diretiva `#INCLUDE` é resolvida **no caminho exato que aponta** (`..\CONST.PRG`, `foo.h`, caminho absoluto), gerando o `.PRG` a partir do `.PR2` correspondente. Antes só se garantia o `CONST.FXP` na raiz — e, sem o arquivo no ponto certo, o VFP **reescreve o path gravado no artefato compilado** (bug conhecido na referência, v2.16.77). Arquivos já existentes nunca são sobrescritos.

### Projetos VB.NET (`.vb`)

- Novo `src/msbuild.ts`, espelhando `MsbuildCompiler.ps1`: ao salvar `.vb`, `.resx`, `.vbproj`, `.settings`, `.snk`, `.manifest`, `.myapp` ou `.config`, a extensão sobe a árvore até o `.vbproj` **mais profundo** que contém o arquivo e regera a DLL. Preferir o mais profundo evita os `.vbproj` órfãos duplicados em vários níveis (MSB3552). Sem esse passo, o VFP segue chamando por COM a DLL antiga.
- Os três comandos de compilação passam a incluir um passo .NET, sempre após os artefatos VFP. Novas configurações: `enableMsbuild`, `msbuildPath`, `msbuildConfiguration` e `msbuildTimeoutMinutes`.
- A busca pelo MSBuild segue a ordem da referência — o do .NET Framework (v4.0.30319) antes dos do Visual Studio — porque os projetos alvo são .NET 3.5/4.x.

### Ordem de compilação

- Alinhada ao `Build-Pj2BinarySet`: `VC2`, `SC2`, `FR2`, `LB2`, `MN2`, `DC2` e `PJ2` por último. Antes, só `VC2` e `SC2` tinham posição definida e o restante caía em ordem alfabética.

### Fora de escopo, por decisão

- **Versionamento automático** do EXE e das DLLs (`Get-NextExeVersion`, `exe-versions.json`): é responsabilidade da pipeline. Aqui vale o que está no `<DevInfo>` do `.pj2` e no `AssemblyInfo` do projeto .NET.
- **Workspace sparse**, deploy e clone dedicado: só fazem sentido no servidor de build.
- **`Reset-VfpIdeEnvironment`** (zerar `_STARTUP` no registro) e matar instâncias órfãs do VFP9: continuam apenas como aviso — mexer no registro ou derrubar o IDE do desenvolvedor seria intrusivo demais numa extensão de editor.

## [1.6.4]

- Fix: **removidas as notificações de controle** introduzidas na 1.6.2. Como notificações não podem ser fechadas por código, cada build (e cada retomada) deixava mais uma para trás, com contador congelado — três empilhadas na tela em vez de uma. O Pausar/Retomar volta a viver **apenas no item da barra de status** e na paleta de comandos.
- Não é possível renomear o botão **Cancelar** da notificação de progresso: a API `withProgress` do VS Code não expõe o rótulo nem aceita botões adicionais. Uma tela única com Pausar/Retomar/Cancelar exigiria um painel webview próprio.
- Fix: o título da retomada não acumula mais sufixos — retomar uma retomada deixava `Compilando repositório — retomando — retomando — retomando`.

## [1.6.3]

- Feat: **cancelar deixou de ser definitivo**. Ao cancelar uma compilação em lote, a extensão informa quantos arquivos ficaram de fora e oferece **Retomar de onde parou** — a retomada reexecuta o mesmo núcleo apenas com o que faltava, em vez de recomeçar o build inteiro. O que já foi compilado permanece.
- A pendência é registrada conforme o build avança. Arquivo a arquivo nos PR2, SQ2, RPT e projetos; **por pasta** no FoxBin2Prg, já que a sessão única do VFP9 não é interrompível no meio — uma pasta só sai da pendência depois de processada por inteiro, e uma retomada a refaz do começo.
- O Output registra `[CANCELADO] N arquivo(s) não processado(s)`, e a retomada entra com o cabeçalho `=== Retomar compilação (N arquivo(s) restantes) ===`.

## [1.6.2]

- Feat: o **Pausar/Retomar** passa a aparecer também como **botão na notificação**, ao lado da que mostra o arquivo sendo compilado — antes só existia o Cancelar ali, e o botão vivia apenas na barra de status. Clicar alterna o estado e a notificação reabre já com o rótulo oposto (`Pausar` ⇄ `Retomar`), mostrando o contador e o arquivo atual.
- O item da barra de status continua existindo: ele mostra o contador ao vivo e serve de reserva caso a notificação seja dispensada.
- Limitações da API do VS Code, herdadas: a notificação de progresso não aceita botões customizados (daí a notificação separada); e uma notificação não pode ser fechada por código — se o build terminar antes de qualquer clique, ela fica visível até ser dispensada, e um clique tardio apenas informa que a compilação já acabou.

## [1.6.1]

- Fix: no comando **Compilar arquivo ou diretório**, o caminho **digitado ou colado** na própria caixa de seleção passa a valer. Antes, o texto digitado só filtrava a lista: se não casasse com nenhuma opção, o Enter não fazia nada. Agora aparece um item no topo (`Compilar arquivo:` / `Compilar pasta:`) e o Enter compila direto, sem passar pelo diálogo do sistema. As três opções da lista continuam funcionando como antes.
- Aceita caminho **relativo** (resolvido a partir do primeiro workspace folder) e **entre aspas** — é como o "Copiar como caminho" do Explorer do Windows entrega. Caminho inexistente mostra `Caminho não encontrado` e mantém a caixa aberta para correção, em vez de fechar silenciosamente.
- Internamente, a caixa passou de `showQuickPick` para `createQuickPick`: só assim é possível ler o texto digitado quando ele não corresponde a nenhum item da lista.

## [1.6.0]

- Feat: **build do executável** dos projetos `.pj2` — o fluxo passa a ser `.pj2` → `.pjx/.pjt` (PRG2BIN) → **`.EXE`** (`BUILD EXE ... RECOMPILE` no VFP9). Integrado: vale ao **salvar** um `.pj2` e nos três comandos de compilação (repositório, alterados e arquivo/diretório), onde o projeto é sempre o último passo. Nova configuração `visualFoxproCompiler.enablePj2Exe` (padrão: ativado), além de `vfp9Path` e `pj2ExeTimeoutMinutes`.
- **O build usa o mouse.** O `BUILD EXE` abre o diálogo *Locate File*, cujos botões são custom-drawn e ignoram mensagens (`BM_CLICK` não funciona) — é preciso clique de hardware (`SetCursorPos` + `mouse_event`). O motor embarcado `bin/pj2exe/Build-Pj2Exe.ps1` detecta a janela pelo título, torna a thread DPI-aware (senão, em telas com escala ≠ 100%, o clique erra o botão) e clica **apenas** em "Ignore" (2º botão) — o 3º ora é "Ignore all", ora "Remove", e "Remove" editaria a lista de arquivos do projeto. A extensão avisa antes de começar.
- O `RECOMPILE` não é opcional: sem ele, `BUILD EXE ... FROM <pjx>` (e o `loProject.Build` via automação) simplesmente não geram o executável.
- **HomeDir**: o `.pj2` versionado carrega o `HomeDir` da máquina de quem o commitou; o PRG2BIN grava esse caminho no `.pjx` e o build não acha os fontes. A extensão ajusta o HomeDir para a pasta local antes de gerar o `.pjx` e **restaura o valor original** ao final — o arquivo versionado não fica sujo com um caminho de máquina.
- **Guarda de auto-include**: depois do build, o VFP grava no `.pjx` dependências que ele mesmo detectou, inchando o EXE. A extensão regenera o `.pj2` (BIN2PRG), compara com a lista de entrada, marca os novos como excludentes e refaz o build até estabilizar (até 3 passadas). As exclusões descobertas são **persistidas no `.pj2`** (auto-cura: o próximo build não repete o drift) e reportadas no Output — aparecem como diff no git para revisão.
- A versão do EXE é a do bloco `<DevInfo>` do `.pj2` (`_MajorVer`/`_MinorVer`/`_Revision`), como o desenvolvedor definiu — a extensão não versiona automaticamente (isso é da pipeline).
- Se a chave `_STARTUP` do VFP9 estiver preenchida no registro (TaskPane), o Output avisa: ela pode abrir um modal que trava o build. A extensão **não** altera o registro.
- No timeout, apenas o `vfp9.exe` iniciado pelo build é encerrado. O fluxo original da pipeline derrubava **todas** as instâncias do VFP9 (`Get-Process -Name vfp9 | Stop-Process`) — inócuo num servidor dedicado, mas na máquina do desenvolvedor isso fecharia o IDE aberto, com trabalho não salvo.
- Builds de EXE do mesmo projeto não se sobrepõem: um segundo pedido (dois saves seguidos, ou um save durante o build em lote) é recusado com aviso, em vez de colocar duas instâncias do VFP9 sobre o mesmo `.pjx` — o que poderia corromper o `.pj2`.
- Refactor: `convertBin2Prg` em `src/foxbin2prg.ts` (direção inversa do PRG2BIN, usada pela guarda) e novo módulo `src/pj2exe.ts` com a orquestração.
- Portado do fluxo já validado em produção no `vfp-compiler-installer` (`VfpExeCompiler.ps1`), que não foi alterado.

## [1.5.0]

- Feat: novo comando **`Visual FoxPro: Compilar arquivo ou diretório`** (`visualFoxproCompiler.buildTarget`). Compila um alvo escolhido pelo desenvolvedor, sem precisar salvar o arquivo nem varrer o repositório inteiro. Pela paleta, um menu pergunta o que compilar — **arquivo atual** (quando o editor ativo é um fonte suportado), **arquivo(s)** ou **pasta** — e abre o diálogo do sistema. O passo prévio existe porque, no Windows, o diálogo do VS Code não seleciona arquivos e pastas ao mesmo tempo.
- Feat: o mesmo comando aparece no **menu de contexto do Explorer** (botão direito) sobre pastas e sobre fontes `.pr2/.sq2/.rpt/.sc2/.vc2/.fr2/.lb2/.mn2/.pj2/.dc2`, aceitando **seleção múltipla**.
- A pasta escolhida é varrida **recursivamente** (ignorando `node_modules`, `.git`, `foxbin2prg` e `rpt2rpa`), com `fs` em vez de `findFiles` — assim o comando também funciona em pastas **fora do workspace**. Nesse caso, o `CONST.FXP` é procurado na própria pasta escolhida; dentro do workspace, continua sendo o da raiz do repositório.
- Reaproveita todo o núcleo existente: ordem de dependência (CONST → PR2 → VC2 antes de SC2 → PJ2), sessão única do VFP9, barra de progresso, **Pausar/Retomar** na barra de status e Cancelar.
- Regra dos `.rpt`: um relatório **selecionado diretamente** sempre gera o `.RPA` (a escolha foi explícita); os encontrados ao **varrer uma pasta** respeitam `enableRpt2Rpa` — cada um pode levar dezenas de minutos. Quando algum é ignorado por essa regra, o Output informa a quantidade.
- A confirmação antes de sobrescrever binários segue a configuração `confirmBuildRepository` e só aparece quando há mais de um arquivo (selecionar um único arquivo compila direto).

## [1.4.0]

- Feat: **pausar/retomar** a compilação em lote. Durante os comandos **Compilar todo o repositório** e **Compilar arquivos alterados (git)**, um item aparece na **barra de status** mostrando o contador (`Pausar VFP 37/412`) e alternando entre **Pausar** e **Retomar** (destacado em amarelo quando pausado). O **Cancelar** continua no botão nativo da notificação de progresso. Também disponível na paleta de comandos como `Visual FoxPro: Pausar/Retomar a compilação em andamento` (visível apenas durante um build). A notificação de progresso do VS Code não aceita botões customizados — daí o botão viver na barra de status.
- A pausa vale **entre arquivos**, nunca no meio de um: o arquivo em processamento sempre termina. Ela atua nos laços da extensão (PR2, SQ2, RPT e entre pastas) e também **dentro da sessão única do VFP9** do FoxBin2Prg — o `Run-Bin2PrgList-VFP9.vbs` passou a receber um arquivo de pausa (4º argumento) e aguarda enquanto ele existir. Sem isso o botão seria inócuo justamente no trecho mais demorado do build.
- Cancelar tem precedência sobre pausar: o cancelamento destrava a espera (inclusive a do VFP9) e encerra o build.
- Change: o timeout do `cscript` deixou de ser o da opção `timeout` do `execFile` e passou a ser controlado pela extensão (`execCscript`), **descontando o tempo pausado** — do contrário uma pausa longa mataria a sessão do VFP9 que estava apenas aguardando.

## [1.3.3]

- Fix: o fluxo **`.rpt` → `.RPA`** travava indefinidamente no modo headless (automação COM). Causa: com o `SET SAFETY` do VFP em ON (padrão), o `SET DEVICE TO FILE C:\CERTTUS\CERTTUS.dsn` do gerador abria um modal **"already exists, overwrite it?"** que ficava **invisível** (o VFP9 roda oculto via COM) e pendurava o `cscript`. Correção: **`SET SAFETY OFF`** no gerador, eliminando o modal de confirmação de sobrescrita (do DSN e do `.RPA`).
- Change: no gerador headless, o **prompt de parâmetros** e a **barra de progresso** do Crystal são suprimidos (`EnableParameterPrompting = .F.` no relatório e nos subrelatórios, `DisplayProgressDialog = .F.`), evitando outros modais que travariam a automação. A geração passa a ser 100% automática (valores default nos parâmetros).
- Fix: **não** é usado `SetLogOnInfo`. A conexão é resolvida pelo **File DSN** original do relatório (`FILEDSN=C:\Certtus\Certtus.dsn`). Uma abordagem anterior chamava `SetLogOnInfo(IP, base, ...)`, o que **alterava a connection** do relatório (`LogOnServerName` passava do File DSN para o IP, com `PreQEServerName`/`LogOnDatabaseName` preenchidos) e causava erro **ODBC IM002** ("data source name not found") nos subrelatórios. Removido — a connection do `.RPA` volta ao formato correto.
- Fix: encerramento determinístico da instância do VFP9 no `Run-Rpt2Rpa-VFP9.vbs` (`CLOSE ALL` / `CLEAR ALL` / `Quit`), evitando processos órfãos do VFP9/Crystal RDC que penduravam o `cscript`.
- Change: o timeout do `cscript` no fluxo `.rpt` → `.RPA` passou de 10 min para **40 min**. Relatórios grandes levam dezenas de minutos, pois o gerador avalia cada objeto/campo via COM contra o banco — caso real medido: ~28 min para um relatório com 18 subrelatórios (RPA de ~930 KB, idêntico ao gerado no ambiente original). Não há como acelerar sem reduzir o que o `.RPA` captura (o gargalo é o Crystal RDC, não o código): uma tentativa de cache dos objetos COM não trouxe ganho.
- O `GeradorDiferencasRelatorio.PRG` embarcado (Windows-1252) foi recompilado para `.FXP` pelo compilador embarcado.

## [1.3.1]

- Change: no comando **Compilar arquivos alterados (git)**, um relatório `.rpt` novo/alterado **sempre** gera o `.RPA`, independentemente da configuração `enableRpt2Rpa`. O objetivo é versionar o diff do que mudou sem exigir uma opção ligada. A configuração `enableRpt2Rpa` passa a controlar **apenas** o comando **Compilar todo o repositório** (build completo, mais custoso). O fluxo `.pr2`/`.sq2` e a ausência de gatilho ao salvar para `.rpt` permanecem inalterados.

## [1.3.0]

- Feat: novo fluxo **`.rpt` → `.RPA`** (relatórios do **Crystal Reports**). Nos comandos **Compilar todo o repositório** e **Compilar arquivos alterados (git)**, gera o arquivo texto `.RPA` de cada `.rpt`, permitindo versionar/comparar (diff) os relatórios binários. Usa o `GeradorDiferencasRelatorio` embarcado em `bin/rpt2rpa`, acionado pelo VFP9 via COM (espelha o padrão do FoxBin2Prg). **Não há gatilho ao salvar** — o `.rpt` é binário; a geração ocorre apenas nos comandos de build. **Desativado por padrão** (nova configuração `visualFoxproCompiler.enableRpt2Rpa`).
- A solução embarcada é uma **cópia adaptada** do `GeradorDiferencasRelatorio.PRG` (o original não é alterado): os `MESSAGEBOX` bloqueantes foram trocados por gravação da mensagem em arquivo de status + exit code, evitando travar o VFP9 headless; falhas são reportadas no Output. O `.PRG` é mantido em Windows-1252 e compilado para `.FXP` pelo compilador embarcado.
- Requisitos do fluxo (documentados): Crystal Reports XI (11) registrado (`CrystalRuntime.Application.11`), `CFG\CONEXAO.MEM` acessível a partir do `.rpt` e conexão PostgreSQL ativa (a seção de SQL do relatório é resolvida contra o banco).
- Refactor: ponte com o VFP9 via `cscript` extraída para `src/vfpBridge.ts` (`resolveCscript`/`execCscript`), compartilhada por `foxbin2prg.ts` e pelo novo `rpt2rpa.ts`.
- Ativação: adicionado `workspaceContains:**/*.rpt`.

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

