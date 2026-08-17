<#
.SYNOPSIS
    Build-Pj2Exe.ps1 - Gera o EXE de um projeto VFP9 a partir do .PJX, executando
    'BUILD EXE <out> FROM <pjx> RECOMPILE' no vfp9.exe e clicando automaticamente no
    botao "Ignore" do dialogo "Locate File" enquanto ele aparecer.

.DESCRIPTION
    Portado do fluxo validado em vfp-compiler-installer (Invoke-BuildExeRecompileAutoclick).
    Pontos que NAO podem mudar:

      * O RECOMPILE e' essencial - sem ele, 'BUILD EXE ... FROM <pjx>' (e o loProject.Build
        via automacao) NAO geram o EXE.
      * O clique tem que ser de HARDWARE (SetCursorPos + mouse_event). Os botoes do dialogo
        do VFP sao custom-drawn e ignoram mensagens (BM_CLICK nao funciona).
      * Clicamos SO' o "Ignore" (2o botao, fracao 0.375 da largura). O 3o botao ora e'
        "Ignore all" ora "Remove" - e "Remove" EDITARIA a lista de arquivos do projeto.
      * A thread precisa ser DPI-aware: sem isso, em telas com escala != 100% o GetWindowRect
        vem virtualizado enquanto o SetCursorPos usa pixels fisicos, e o clique erra o botao.

    Enquanto o build roda, o mouse e' usado pelo script - por isso a extensao avisa antes.

.PARAMETER PjxPath    Projeto binario (.pjx) ja' gerado pelo PRG2BIN.
.PARAMETER ExeOut     Caminho do executavel (com ou sem .EXE).
.PARAMETER Vfp9Path   vfp9.exe. Vazio = procura nos caminhos padrao de instalacao.
.PARAMETER TimeoutSec Limite total do build.
.PARAMETER StatusFile Arquivo onde a mensagem de erro/aviso e' gravada para a extensao ler.

.OUTPUTS
    Exit code 0 = EXE gerado; 1 = falha (motivo no StatusFile).
#>
param(
    [Parameter(Mandatory = $true)][string]$PjxPath,
    [Parameter(Mandatory = $true)][string]$ExeOut,
    [string]$Vfp9Path = '',
    [int]$TimeoutSec = 900,
    [string]$StatusFile = '',
    [double]$IgnoreFx = 0.375,
    [double]$IgnoreFy = 0.78
)

$ErrorActionPreference = 'Stop'

function Write-Status {
    param([string]$Message)
    Write-Output $Message
    if ($StatusFile) {
        try { [System.IO.File]::WriteAllText($StatusFile, $Message) } catch { }
    }
}

function Get-Vfp9Exe {
    param([string]$Configured)
    if ($Configured -and (Test-Path -LiteralPath $Configured)) { return $Configured }
    foreach ($p in @(
            'C:\Program Files (x86)\Microsoft Visual FoxPro 9\vfp9.exe',
            'C:\Program Files\Microsoft Visual FoxPro 9\vfp9.exe'
        )) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    return $null
}

function Test-VfpStartupLimpo {
    # O _STARTUP do registry (TaskPane.app) faz o IDE carregar a frmPaneManager, cujo timer
    # falha com "Variable 'CSAVEMSG' is not found" -> modal que trava o build. Aqui apenas
    # AVISAMOS: mexer no registry do desenvolvedor sem pedir seria intrusivo.
    foreach ($key in @(
            'HKCU:\Software\Microsoft\VisualFoxPro\9.0\Options',
            'HKCU:\Software\Microsoft\Visual FoxPro\9.0\Options'
        )) {
        if (-not (Test-Path $key)) { continue }
        try {
            $cur = (Get-ItemProperty -Path $key -Name '_STARTUP' -ErrorAction SilentlyContinue).'_STARTUP'
            if ($cur) {
                Write-Output "[AVISO] _STARTUP do VFP9 esta definido ($key = '$cur'). Se o build travar num modal, limpe essa chave."
            }
        } catch { }
    }
}

function Initialize-VfpAutoclick {
    if (([System.Management.Automation.PSTypeName]'VfpAuto.Click').Type) { return }
    Add-Type -Namespace 'VfpAuto' -Name 'Click' -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, System.IntPtr p);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Auto)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.IntPtr e);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr SetThreadDpiAwarenessContext(System.IntPtr ctx);
public struct RECT { public int L, T, R, B; }
public delegate bool EnumWindowsProc(System.IntPtr h, System.IntPtr p);
public static System.IntPtr FindLocate(uint pid) {
    System.IntPtr hit = System.IntPtr.Zero;
    EnumWindows(delegate(System.IntPtr h, System.IntPtr p) {
        uint w; GetWindowThreadProcessId(h, out w);
        if (w != pid || !IsWindowVisible(h)) { return true; }
        var sb = new System.Text.StringBuilder(512); GetWindowText(h, sb, sb.Capacity);
        if (sb.ToString().IndexOf("Locate File", System.StringComparison.OrdinalIgnoreCase) >= 0) { hit = h; return false; }
        return true;
    }, System.IntPtr.Zero);
    return hit;
}
public static void ClickAt(int x, int y) { SetCursorPos(x, y); mouse_event(0x0002, 0, 0, 0, System.IntPtr.Zero); mouse_event(0x0004, 0, 0, 0, System.IntPtr.Zero); }
public static bool MakeThreadDpiAware() {
    try {
        var r = SetThreadDpiAwarenessContext(new System.IntPtr(-4));
        if (r == System.IntPtr.Zero) { r = SetThreadDpiAwarenessContext(new System.IntPtr(-3)); }
        return r != System.IntPtr.Zero;
    } catch { return false; }
}
'@ -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------------------

$vfp = Get-Vfp9Exe -Configured $Vfp9Path
if (-not $vfp) {
    Write-Status 'vfp9.exe nao encontrado. Instale o Visual FoxPro 9 ou informe o caminho em visualFoxproCompiler.vfp9Path.'
    exit 1
}
if (-not (Test-Path -LiteralPath $PjxPath)) {
    Write-Status "Projeto binario nao encontrado: $PjxPath"
    exit 1
}

Test-VfpStartupLimpo

$exeFull = if ($ExeOut -match '(?i)\.exe$') { $ExeOut } else { "$ExeOut.EXE" }
$exeNoExt = $exeFull -replace '(?i)\.exe$', ''
$dir = Split-Path $PjxPath -Parent
$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$prg = Join-Path $dir "__buildexe-$tag.prg"

if (Test-Path -LiteralPath $exeFull) { Remove-Item -LiteralPath $exeFull -Force -ErrorAction SilentlyContinue }

$prgBody = @"
ON ERROR *
SET SAFETY OFF
SET TALK OFF
BUILD EXE '$exeNoExt' FROM '$PjxPath' RECOMPILE
QUIT
"@
[System.IO.File]::WriteAllText($prg, $prgBody, (New-Object System.Text.UTF8Encoding($false)))

Initialize-VfpAutoclick
try { [void][VfpAuto.Click]::MakeThreadDpiAware() } catch { }

$clicks = 0
try {
    $p = Start-Process -FilePath $vfp -ArgumentList '-t', "`"$prg`"" -WorkingDirectory $dir -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
    while (-not $p.HasExited) {
        if ([DateTime]::UtcNow -ge $deadline) {
            try { $p.Kill() } catch { }
            @(Get-Process -Name 'vfp9' -ErrorAction SilentlyContinue) | Stop-Process -Force -ErrorAction SilentlyContinue
            Write-Status "Timeout do BUILD EXE RECOMPILE (${TimeoutSec}s) apos $clicks clique(s)."
            exit 1
        }
        $h = [VfpAuto.Click]::FindLocate([uint32]$p.Id)
        if ($h -ne [IntPtr]::Zero) {
            $rc = New-Object 'VfpAuto.Click+RECT'
            if ([VfpAuto.Click]::GetWindowRect($h, [ref]$rc)) {
                $w = $rc.R - $rc.L
                $ht = $rc.B - $rc.T
                if ($w -gt 0 -and $ht -gt 0) {
                    $bx = [int]($rc.L + $w * $IgnoreFx)
                    $by = [int]($rc.T + $ht * $IgnoreFy)
                    [void][VfpAuto.Click]::SetForegroundWindow($h)
                    Start-Sleep -Milliseconds 100
                    [VfpAuto.Click]::ClickAt($bx, $by)
                    $clicks++
                }
            }
            Start-Sleep -Milliseconds 220
        } else {
            Start-Sleep -Milliseconds 180
        }
    }
} catch {
    Write-Status "Falha executando o vfp9.exe: $_"
    exit 1
} finally {
    Remove-Item -LiteralPath $prg -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $exeFull) {
    Write-Output "EXE gerado: $exeFull ($clicks clique(s) no dialogo Locate File)"
    exit 0
}

Write-Status "BUILD EXE RECOMPILE nao gerou o executavel (apos $clicks clique(s))."
exit 1
