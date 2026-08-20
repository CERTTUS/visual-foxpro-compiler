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

Para os projetos, há um passo a mais:

- **`.pj2`** → além do `.pjx`/`.pjt`, gera o **`.EXE`** do projeto (`BUILD EXE ... RECOMPILE` no VFP9). Vale ao salvar o `.pj2` e nos comandos de compilação, onde o projeto é sempre o último passo. Controlado por `enablePj2Exe` (ativado por padrão) — ver [Build do EXE](#build-do-exe-pj2--exe).

Além disso, nos comandos de compilação (repositório/alterados):

- **`.rpt`** (relatórios do **Crystal Reports**) → gera o **`.RPA`** (arquivo texto) de mesmo nome/diretório, usando o `GeradorDiferencasRelatorio` embarcado, acionado pelo Visual FoxPro 9 (COM). O `.RPA` permite versionar e comparar (diff) os relatórios binários no controle de versão. **Não há gatilho ao salvar** — o `.rpt` é binário; a geração ocorre apenas nos comandos de build. No **Compilar arquivos alterados (git)**, um `.rpt` alterado **sempre** gera o `.RPA`; no **Compilar todo o repositório**, depende da configuração `enableRpt2Rpa` (desativada por padrão). Exige Crystal Reports e banco (ver [Requisitos](#requisitos)).

![Captura do compilador](image1.png)

## Compilar todo o repositório

Para quem clonou um repositório contendo **apenas os fontes** (texto) e precisa gerar os binários:

- Abra **Configurações** → busque por `Visual FoxPro` e clique no link **“Compilar todo o repositório agora”**; ou
- Rode o comando **`Visual FoxPro: Compilar todo o repositório (gerar binários)`** na paleta de comandos (`Ctrl+Shift+P`).

A ação varre o(s) workspace folder(s), gera `PRG`+`FXP` de todos os `.pr2`, os `.SQL` de todos os `.sq2` e os binários VFP (`SCX/VCX/FRX…`) de todos os textos FoxBin2Prg, mostrando o progresso e o resultado por arquivo no Output. Binários existentes são sobrescritos (há confirmação, controlável pela configuração `confirmBuildRepository`). O comando **`Visual FoxPro: Compilar arquivos alterados (git)`** (`Ctrl+Shift+Alt+S`) faz o mesmo apenas para os fontes modificados/criados segundo o git — incluindo os `.sq2`.

## Compilar um arquivo ou um diretório

Quando não se quer o repositório inteiro nem depender do que o git aponta como alterado, use **`Visual FoxPro: Compilar arquivo ou diretório`** (`Ctrl+Shift+P`). Um menu pergunta o que compilar:

| Opção | O que faz |
|-------|-----------|
| **Arquivo atual** | Compila o fonte aberto no editor (só aparece se a extensão for suportada) |
| **Escolher arquivo(s)…** | Diálogo do sistema, com seleção múltipla |
| **Escolher pasta…** | Diálogo do sistema; compila todos os fontes da pasta, **incluindo subpastas** |
| **Digitar o caminho** | Digite ou cole um caminho na própria caixa e tecle Enter — compila direto, sem diálogo |

O caminho digitado pode ser **relativo** (a partir da raiz do workspace) e pode vir **entre aspas**, como o "Copiar como caminho" do Explorer do Windows entrega. Se não existir, a caixa avisa e continua aberta para correção.

O mesmo comando está no **menu de contexto do Explorer**: clique com o botão direito numa pasta ou num fonte (`.pr2`, `.sq2`, `.rpt`, `.sc2`, `.vc2`, `.fr2`, `.lb2`, `.mn2`, `.pj2`, `.dc2`) — a seleção múltipla também é aceita.

A varredura ignora `node_modules`, `.git`, `foxbin2prg` e `rpt2rpa`, e vale inclusive para pastas **fora do workspace** (nesse caso o `CONST.FXP` é procurado na própria pasta escolhida). Tudo o mais é igual ao build do repositório: ordem de dependência (CONST → PR2 → VC2 antes de SC2 → PJ2), sessão única do VFP9, progresso, pausa e cancelamento.

> **Relatórios `.rpt` neste comando**: um `.rpt` **selecionado diretamente** sempre gera o `.RPA`. Os encontrados ao varrer uma **pasta** respeitam a configuração `enableRpt2Rpa` (desativada por padrão), já que cada relatório pode levar dezenas de minutos; quando algum é ignorado por isso, o Output informa a quantidade.

### Pausar e retomar

Enquanto a compilação em lote roda (repositório inteiro, apenas os alterados ou um arquivo/diretório), o Pausar/Retomar fica disponível em dois lugares:

```
Notificação de progresso        Compilando repositório...  37 / 412 — arquivo.vc2   [X]
Notificação de controle         Compilando 37/412 — arquivo.vc2          [ Pausar ]
Barra de status                 $(⏸) Pausar VFP 37/412
```

Clicar em **Pausar** (na notificação ou na barra de status) alterna para **Retomar**; a notificação reabre já com o rótulo novo. O **Cancelar** continua sendo o `X` da notificação de progresso.

O mesmo comando está na paleta como **`Visual FoxPro: Pausar/Retomar a compilação em andamento`** (visível apenas durante um build). A notificação de controle é separada da de progresso porque esta última, pela API do VS Code, não aceita botões além do Cancelar nativo. Se você dispensar a notificação de controle, ela não volta — o item da barra de status continua valendo.

### Cancelar e retomar

O **Cancelar** (`X` da notificação de progresso) não é definitivo: ao interromper, a extensão informa quantos arquivos ficaram de fora e oferece **Retomar de onde parou**.

```
Compilação cancelada — 287 arquivo(s) não foram compilados.   [ Retomar de onde parou ]
```

A retomada compila **apenas o que faltava** — o que já foi gerado permanece. A pendência é registrada arquivo a arquivo nos `.pr2`, `.sq2`, `.rpt` e projetos; nos textos FoxBin2Prg ela é **por pasta**, porque a sessão única do VFP9 não pode ser interrompida no meio: uma pasta só sai da pendência quando termina, e retomar refaz aquela pasta desde o início.

A pausa acontece **entre arquivos** — o arquivo em processamento sempre termina — e vale inclusive **dentro da sessão única do VFP9** do FoxBin2Prg, que é a etapa mais demorada. **Cancelar tem precedência sobre pausar**: se você cancelar durante uma pausa, a espera é destravada e o build encerra. O tempo pausado não conta para o timeout da sessão do VFP9.

> **CONST.FXP**: antes de compilar os PR2 (tanto no build quanto ao salvar um `.pr2`), a extensão verifica se o `CONST.FXP` existe na raiz do repositório. Se não existir e houver um `CONST.PR2`, ele é compilado primeiro — assim os PR2 que fazem `#INCLUDE CONST.PRG` não falham por constantes ausentes.

> **Ordem das classes/formulários**: no build, as `VC2` (classes) são geradas **antes** das `SC2` (formulários), pois os formulários incorporam as classes. Entre as bibliotecas `VC2`, a ordem segue a configuração `visualFoxproCompiler.vcxBuildOrder` (padrão: `vclFormularios`, `vclComponentesBasicos`, `vclComponentesIntegrados`); as demais `VC2` seguem em ordem alfabética e o `PJ2` (projeto) é processado por último. Tudo numa única sessão do VFP9 por pasta.

## Build do EXE (`.pj2` → `.EXE`)

```
.pj2  --PRG2BIN-->  .pjx / .pjt  --BUILD EXE RECOMPILE-->  .EXE
```

> ⚠️ **O build usa o mouse.** O `BUILD EXE` do VFP9 abre o diálogo *Locate File*, cujos botões são custom-drawn e ignoram mensagens (`BM_CLICK` não funciona). A extensão move o cursor e clica em **Ignore** enquanto o diálogo aparecer. Durante esses minutos, não use o mouse. Para desligar o build de EXE, use `enablePj2Exe`.

Só o botão **Ignore** (2º) é clicado: o 3º ora é "Ignore all", ora "Remove" — e "Remove" *editaria a lista de arquivos do projeto*. O `RECOMPILE` também não é opcional: sem ele, `BUILD EXE ... FROM <pjx>` não gera o executável.

**HomeDir** — o `.pj2` versionado carrega o `HomeDir` da máquina de quem o commitou; o PRG2BIN grava esse caminho no `.pjx` e o build não encontra os fontes. A extensão aponta o HomeDir para a pasta local antes de gerar o `.pjx` e **restaura o valor original** ao final, para o arquivo versionado não ficar sujo com um caminho de máquina.

**Auto-include** — depois do build, o VFP acrescenta ao projeto dependências que detectou sozinho, inchando o EXE. A extensão regenera o `.pj2` (BIN2PRG), compara com a lista original, marca os novos como excludentes e refaz o build até estabilizar (até 3 passadas):

```
BUILD EXE (passada 1): CERTTUS.EXE
Auto-include detectado (3): consulta.prg, util.vcx, rel.frx — marcando como excludente e rebuildando.
BUILD EXE (passada 2): CERTTUS.EXE
[INFO] CERTTUS.pj2 atualizado com 3 exclusão(ões) permanente(s) — revise o diff no git.
[OK]  EXE  C:\...\CERTTUS.EXE (2 passadas — auto-include tratado)
```

As exclusões ficam gravadas no `.pj2` (auto-cura: o próximo build não repete o drift) e aparecem como diff no git para você revisar antes de commitar.

**Versão do EXE** — é a do bloco `<DevInfo>` do `.pj2` (`_MajorVer`/`_MinorVer`/`_Revision`), como você definiu. A extensão não versiona automaticamente; o versionamento por release é responsabilidade da pipeline.

> Se a chave `_STARTUP` do VFP9 estiver preenchida no registro (Task Pane), o Output avisa — ela pode abrir um modal que trava o build. A extensão não altera o registro; a limpeza é sua.

## Configuração

- **visualFoxproCompiler.convertEncodingBeforeCompile** — Se ativado, o conteúdo UTF-8 do `.pr2` é gravado no `.prg` (e o do `.sq2` no `.SQL`) em Windows-1252. Se desativado, os bytes são copiados sem conversão.
- **visualFoxproCompiler.enableFoxBin2Prg** — Ativa a geração de binários VFP (PRG2BIN) ao salvar arquivos de texto FoxBin2Prg. Padrão: ativado.
- **visualFoxproCompiler.enableRpt2Rpa** — No comando **Compilar todo o repositório**, gera o `.RPA` (texto) de cada relatório Crystal Reports (`.rpt`) via VFP9 + Crystal 11. Padrão: **desativado** (requer Crystal Reports e banco — ver Requisitos). **Não afeta** o comando **Compilar arquivos alterados (git)**, no qual um `.rpt` alterado sempre gera o `.RPA`.
- **visualFoxproCompiler.foxBin2PrgUtf8** — Trata os arquivos de texto FoxBin2Prg como UTF-8: converte para Windows-1252 apenas durante o PRG2BIN e mantém o arquivo em UTF-8 no disco. Padrão: ativado.
- **visualFoxproCompiler.enablePj2Exe** — Gera o `.EXE` dos projetos `.pj2` (`BUILD EXE ... RECOMPILE`), ao salvar e nos comandos de compilação. Padrão: ativado. **O build usa o mouse** (ver [Build do EXE](#build-do-exe-pj2--exe)).
- **visualFoxproCompiler.vfp9Path** — Caminho do `vfp9.exe` usado no build do EXE. Vazio: procura nos caminhos padrão de instalação.
- **visualFoxproCompiler.pj2ExeTimeoutMinutes** — Tempo máximo de cada `BUILD EXE`. Padrão: 15 minutos.
- **visualFoxproCompiler.confirmBuildRepository** — Pede confirmação antes de compilar todo o repositório. Padrão: ativado. (A descrição desta configuração contém o link para acionar a compilação.)
- **visualFoxproCompiler.vcxBuildOrder** — Ordem de compilação das bibliotecas de classes (VC2), por nome. Padrão: `vclFormularios`, `vclComponentesBasicos`, `vclComponentesIntegrados`.

## Requisitos

- Windows (win32)
- **Fluxo `.pj2` → `.EXE`** — exige o `vfp9.exe` (o IDE, não só o runtime) e uma sessão interativa com mouse disponível, pois o auto-clique é de hardware. Não funciona em sessão headless/bloqueada.
- **Visual FoxPro 9 instalado** na máquina. O fluxo `.pr2` usa os binários do compilador incluídos na extensão; o fluxo FoxBin2Prg aciona o VFP9 via automação COM (`VisualFoxPro.Application.9`) rodando o `foxbin2prg.prg` embarcado em `bin/foxbin2prg`.
- **Fluxo `.rpt` → `.RPA` (opcional, `enableRpt2Rpa`)** — além do VFP9, exige:
  - **Crystal Reports XI (11)** instalado e registrado (`CrystalRuntime.Application.11`);
  - um arquivo **`CFG\CONEXAO.MEM`** acessível a partir da pasta do `.rpt` (o gerador sobe na árvore de diretórios procurando-o), contendo `conn_IP`/`conn_DB`;
  - conexão **PostgreSQL** ativa — a seção de SQL do relatório é resolvida contra o banco (via ODBC, DSN `C:\CERTTUS\CERTTUS.dsn` reescrito pelo gerador).

  O gerador (`bin/rpt2rpa/GeradorDiferencasRelatorio.FXP`) é uma cópia embarcada do `GeradorDiferencasRelatorio.PRG` adaptada para automação headless (sem `MESSAGEBOX` bloqueante; erros gravados e reportados no Output). O `.RPA` inclui a linha `PrintDate` (data da geração), que aparecerá como diferença a cada execução.

## Créditos

A conversão de binários VFP usa o [FoxBin2Prg](https://github.com/CERTTUS/foxbin2prg) (fork CERTTUS) embarcado na extensão.
