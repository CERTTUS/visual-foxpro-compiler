'---------------------------------------------------------------------------------------------------
'	Run-Rpt2Rpa-VFP9.vbs - Gera o .RPA (texto) de um relatorio Crystal Reports (.RPT) via VFP9.
'	Aciona o GeradorDiferencasRelatorio.FXP embarcado usando o Visual FoxPro 9 instalado (COM).
'	Requer: VFP9 registrado + Crystal Reports XI (11) registrado (CrystalRuntime.Application.11).
'---------------------------------------------------------------------------------------------------
'	Uso:
'		cscript //nologo Run-Rpt2Rpa-VFP9.vbs "C:\Caminho\Relatorio.rpt" ["C:\Temp\status.txt"]
'		Arg 1: caminho do .RPT (obrigatorio). Gera "Relatorio.RPA" no mesmo diretorio.
'		Arg 2: arquivo de status/erro (opcional) - o PRG grava nele as mensagens de erro.
'---------------------------------------------------------------------------------------------------
'	Coloque este arquivo na mesma pasta do GeradorDiferencasRelatorio.FXP.
'---------------------------------------------------------------------------------------------------

Dim oVFP9, nExitCode, lcFoxPath, lcRpt, lcStatus

If WScript.Arguments.Count < 1 Then
	WScript.Echo "Uso: cscript Run-Rpt2Rpa-VFP9.vbs ""Caminho\Relatorio.rpt"" [arquivo_status_opcional]"
	WScript.Quit 1
End If

lcRpt = WScript.Arguments(0)
lcStatus = ""
If WScript.Arguments.Count >= 2 Then
	lcStatus = Trim(WScript.Arguments(1))
End If

lcFoxPath = Replace(WScript.ScriptFullName, WScript.ScriptName, "")

WScript.Echo "Run-Rpt2Rpa: Conectando ao VFP9..."
On Error Resume Next
Set oVFP9 = CreateObject("VisualFoxPro.Application.9")
If Err.Number <> 0 Then
	WScript.Echo "Erro: Visual FoxPro 9 nao encontrado. Instale o VFP9 ou registre-o."
	WScript.Quit 1
End If
On Error Goto 0

On Error Resume Next
oVFP9.DoCmd("CD """ & lcFoxPath & """")
If Err.Number <> 0 Then
	WScript.Echo "Erro ao mudar diretorio: " & Err.Description
	Set oVFP9 = Nothing
	WScript.Quit 1
End If

' Publica o caminho do arquivo de status para o PRG (P_Rpt2RpaErro grava nele em caso de erro).
oVFP9.DoCmd("PUBLIC gcRpt2RpaStatusFile")
oVFP9.DoCmd("gcRpt2RpaStatusFile = """ & Replace(lcStatus, """", """""") & """")

' Executa o gerador para o relatorio informado.
oVFP9.DoCmd("DO GeradorDiferencasRelatorio.FXP WITH """ & Replace(lcRpt, """", """""") & """")
If Err.Number <> 0 Then
	WScript.Echo "Erro ao executar o gerador: " & Err.Description
	oVFP9.DoCmd("CLEAR ALL")
	Set oVFP9 = Nothing
	WScript.Quit 1
End If

nExitCode = oVFP9.Eval("IIF(TYPE('_screen.o_Rpt2Rpa_ExitCode')='N', _screen.o_Rpt2Rpa_ExitCode, 0)")
If Err.Number <> 0 Then nExitCode = 0

' Encerra a instancia do VFP9 de forma determinista. Sem o Quit explicito, o VFP9
' iniciado por Automation (com objetos COM do Crystal) pode nao fechar sozinho ao
' liberar a referencia — deixando processos orfaos que penduram o cscript e sujam
' o ambiente COM da proxima execucao (comportamento intermitente do Crystal RDC).
On Error Resume Next
oVFP9.DoCmd("CLOSE ALL")
oVFP9.DoCmd("CLEAR ALL")
oVFP9.Quit
Set oVFP9 = Nothing
On Error Goto 0

WScript.Quit nExitCode
