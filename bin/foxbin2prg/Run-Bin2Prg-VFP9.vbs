'---------------------------------------------------------------------------------------------------
'	Run-Bin2Prg-VFP9.vbs - Executa FoxBin2Prg via VFP9 (usa PRG, NAO o EXE)
'	Alternativa quando FoxBin2Prg.EXE nao e compativel com a versao do Windows.
'---------------------------------------------------------------------------------------------------
'	Uso:
'		Projeto completo: cscript //nologo Run-Bin2Prg-VFP9.vbs "C:\Caminho\Do\Projeto"
'		Arquivo unico:    cscript //nologo Run-Bin2Prg-VFP9.vbs "C:\Caminho\Arquivo.sc2" "PRG2BIN"
'		Arquivo unico:    cscript //nologo Run-Bin2Prg-VFP9.vbs "C:\Caminho\Arquivo.scx" "BIN2PRG"
'		Base recompilacao (opcional, 3º arg): pasta usada como tcRecompile no FoxBin2Prg quando o
'		arquivo de entrada esta em outro local (ex.: TEMP). Evita falha de #INCLUDE com caminhos relativos.
'		Ex.: ... "C:\TEMP\arquivo.sc2" "PRG2BIN" "C:\Projeto\Comercial"
'---------------------------------------------------------------------------------------------------
'	Coloque este arquivo na mesma pasta do foxbin2prg.prg.
'---------------------------------------------------------------------------------------------------

Dim oVFP9, nExitCode, lcFoxPath, lcPath, lcDirection, lcRecompileBase, lcCfg

If WScript.Arguments.Count < 1 Then
	WScript.Echo "Uso: cscript Run-Bin2Prg-VFP9.vbs ""Caminho\Do\Projeto"" [PRG2BIN|BIN2PRG|Bin2Prg] [pasta_base_recompilacao_opcional]"
	WScript.Quit 1
End If

lcPath = WScript.Arguments(0)
lcDirection = "Bin2Prg"
If WScript.Arguments.Count >= 2 Then
	lcDirection = UCase(WScript.Arguments(1))
	If lcDirection = "BIN2PRG" Or lcDirection = "PRG2BIN" Then
		' OK - direcao valida
	Else
		lcDirection = "Bin2Prg"
	End If
End If

lcRecompileBase = ""
If WScript.Arguments.Count >= 3 Then
	lcRecompileBase = Trim(WScript.Arguments(2))
End If

lcFoxPath = Replace(WScript.ScriptFullName, WScript.ScriptName, "")

WScript.Echo "Run-Bin2Prg: Conectando ao VFP9..."
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

' Passa o foxbin2prg.cfg explicitamente para garantir extensoes em maiusculas (SC2, VC2, etc.)
' tcRecompile: string vazia deixa o FoxBin2Prg usar Justpath do arquivo; path forca CD antes do COMPILE
' (evita .F. no parametro — quebrava #INCLUDE relativo e o tratamento de recompilacao).
lcCfg = lcFoxPath & "foxbin2prg.cfg"
If Len(lcRecompileBase) > 0 Then
	oVFP9.DoCmd("DO foxbin2prg.prg WITH """ & Replace(lcPath, """", """""") & """, """ & lcDirection & """, """", .F., .F., .F., .F., """", """ & Replace(lcRecompileBase, """", """""") & """, .F., """ & Replace(lcCfg, """", """""") & """, """"")
Else
	oVFP9.DoCmd("DO foxbin2prg.prg WITH """ & Replace(lcPath, """", """""") & """, """ & lcDirection & """, """", .F., .F., .F., .F., """", """", .F., """ & Replace(lcCfg, """", """""") & """, """"")
End If
If Err.Number <> 0 Then
	WScript.Echo "Erro ao executar FoxBin2Prg: " & Err.Description
	oVFP9.DoCmd("CLEAR ALL")
	Set oVFP9 = Nothing
	WScript.Quit 1
End If

nExitCode = oVFP9.Eval("IIF(TYPE('_screen.o_FoxBin2Prg_LastExitCode')='N', _screen.o_FoxBin2Prg_LastExitCode, 0)")
If Err.Number <> 0 Then nExitCode = 0
On Error Goto 0

oVFP9.DoCmd("CLEAR ALL")
Set oVFP9 = Nothing

WScript.Quit nExitCode
