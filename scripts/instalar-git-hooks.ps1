# Instala o hook post-merge para compilacao automatica apos git pull.
#
# Uso (na raiz do projeto FoxPro que usa a extensao):
#   .\scripts\instalar-git-hooks.ps1              # core.hooksPath local (recomendado)
#   .\scripts\instalar-git-hooks.ps1 -CopyToGitHooks   # copia para .git/hooks/
#
# Requer PowerShell 7+ (pwsh) para o hook post-merge.

param(
    [Parameter(Mandatory = $false)]
    [switch]$CopyToGitHooks,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) {
    throw 'Nao esta dentro de um repositorio git.'
}

$hooksRel = 'tools/git-hooks/hooks'
$hooksSource = Join-Path $repoRoot ($hooksRel -replace '/', [IO.Path]::DirectorySeparatorChar)

if (-not (Test-Path (Join-Path $hooksSource 'post-merge.ps1'))) {
    throw "Hook post-merge nao encontrado em $hooksSource. Copie tools/git-hooks/ do repositorio visual-foxpro-compiler."
}

if ($CopyToGitHooks) {
    $hooksTarget = Join-Path $repoRoot '.git/hooks'
    if (-not (Test-Path $hooksTarget)) {
        throw "Pasta de hooks destino nao existe: $hooksTarget"
    }

    $ps1Src = Join-Path $hooksSource 'post-merge.ps1'
    $ps1Dst = Join-Path $hooksTarget 'post-merge.ps1'
    $shDst = Join-Path $hooksTarget 'post-merge'

    if ($DryRun) {
        Write-Host "[DRY-RUN] Copiaria post-merge.ps1 -> $ps1Dst"
        Write-Host "[DRY-RUN] Geraria post-merge -> $shDst"
    } else {
        Copy-Item -Path $ps1Src -Destination $ps1Dst -Force
        @'
#!/bin/sh
set -e
git_dir="$(git rev-parse --git-dir)"
exec pwsh -NoProfile -File "$git_dir/hooks/post-merge.ps1" "$@"
'@ | Set-Content -Path $shDst -Encoding utf8NoBOM -NoNewline
        Write-Host "Instalado: $ps1Dst"
        Write-Host "Instalado: $shDst"
    }
} else {
    $hooksPath = $hooksRel -replace '\\', '/'
    if ($DryRun) {
        Write-Host "[DRY-RUN] git config core.hooksPath $hooksPath"
    } else {
        & git -C $repoRoot config core.hooksPath $hooksPath
        Write-Host "core.hooksPath = $hooksPath (config local do repositorio)"
    }
}

Write-Host ''
Write-Host 'Hook post-merge instalado. Apos git pull com fontes VFP, a extensao Visual FoxPro Compiler compila automaticamente.'
Write-Host 'Opt-out por pull: CERTTUS_SKIP_COMPILE_PULL=1 git pull'
Write-Host ''
