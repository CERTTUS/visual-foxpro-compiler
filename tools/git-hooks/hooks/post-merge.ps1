# post-merge.ps1 - sinaliza compilacao automatica apos git pull/merge
# Disparado pelo wrapper tools/git-hooks/hooks/post-merge (core.hooksPath).

param()

$ErrorActionPreference = 'Stop'

if ($env:CERTTUS_SKIP_COMPILE_PULL -eq '1') {
    exit 0
}

try {
    $repoRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
    if (-not $repoRoot) { exit 0 }

    $origHead = (& git -C $repoRoot rev-parse --verify ORIG_HEAD 2>$null).Trim()
    if (-not $origHead) { exit 0 }

    $compilePattern = '\.(pr2|sc2|vc2|fr2|lb2|mn2|pj2|dc2|sq2|rpt)$'
    # Uniao dos arquivos tocados em todos os commits do pull (nao so o diff liquido).
    $compileFiles = @(
        & git -C $repoRoot -c core.quotepath=false log "$origHead..HEAD" --name-only --pretty=format: --diff-filter=ACMR 2>$null |
            Where-Object { $_ -and ($_ -match $compilePattern) }
    )

    if ($compileFiles.Count -eq 0) { exit 0 }

    $gitDirRaw = (& git -C $repoRoot rev-parse --git-dir 2>$null).Trim()
    if (-not $gitDirRaw) { exit 0 }

    $gitDir = if ([System.IO.Path]::IsPathRooted($gitDirRaw)) {
        $gitDirRaw
    } else {
        Join-Path $repoRoot $gitDirRaw
    }

    $pending = Join-Path $gitDir 'certtus-compile-pull.pending'
    Set-Content -Path $pending -Value $origHead -NoNewline -Encoding utf8

    Write-Host ''
    Write-Host '[Visual FoxPro Compiler] Compilacao automatica agendada.' -ForegroundColor Cyan
    Write-Host "                          Fontes no pull: $($compileFiles.Count) arquivo(s)."
    Write-Host '                          Abra o Cursor ou aguarde se ja estiver aberto.'
    Write-Host '                          Para pular: CERTTUS_SKIP_COMPILE_PULL=1 git pull'
    Write-Host ''
} catch {
    # Nao bloqueia o merge/pull por falha no sinal de compilacao
    Write-Host "[Visual FoxPro Compiler] Aviso: nao foi possivel agendar compilacao automatica: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

exit 0
