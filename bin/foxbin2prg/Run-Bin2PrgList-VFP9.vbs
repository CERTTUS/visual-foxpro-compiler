'---------------------------------------------------------------------------------------------------
'	Run-Bin2PrgList-VFP9.vbs - Processa uma LISTA ORDENADA de arquivos numa unica sessao do VFP9.
'	Usado para respeitar dependencias de ordem (ex.: VC2/classes antes de SC2/formularios).
'---------------------------------------------------------------------------------------------------
'	Uso:
'		cscript //nologo Run-Bin2PrgList-VFP9.vbs "C:\Temp\lista.txt" "PRG2BIN" ["C:\Temp\status.txt"] ["C:\Temp\pause.flag"]
'	O arquivo de lista contem um caminho por linha, na ordem desejada de processamento
'	(texto Unicode/UTF-16). Coloque este arquivo na mesma pasta do foxbin2prg.prg.
'	O 3o argumento (opcional) e um arquivo de status onde, a cada arquivo, e gravado
'	"<contador>|<nome>" para acompanhamento de progresso pelo processo chamador.
'	O 4o argumento (opcional) e o arquivo de PAUSA: enquanto ele existir, o script
'	aguarda antes de processar o proximo arquivo da lista (botao Pausar da extensao).
'	A espera ocorre ENTRE arquivos - o arquivo em processamento sempre termina.
'---------------------------------------------------------------------------------------------------
Option Explicit

Const ForReading = 1
Const FormatUnicode = -1
Const PauseSleepMs = 300

Dim fso, ts, oVFP9, lcFoxPath, lcListFile, lcDirection, lcLine, nLast, lcCfg
Dim lcStatusFile, nCount, oStatus, lcPauseFile

If WScript.Arguments.Count < 2 Then
	WScript.Echo "Uso: cscript Run-Bin2PrgList-VFP9.vbs ""lista.txt"" [PRG2BIN|BIN2PRG] [status.txt]"
	WScript.Quit 1
End If

lcListFile = WScript.Arguments(0)
lcDirection = UCase(WScript.Arguments(1))
If lcDirection <> "BIN2PRG" And lcDirection <> "PRG2BIN" Then lcDirection = "PRG2BIN"

lcStatusFile = ""
If WScript.Arguments.Count >= 3 Then lcStatusFile = WScript.Arguments(2)

lcPauseFile = ""
If WScript.Arguments.Count >= 4 Then lcPauseFile = Trim(WScript.Arguments(3))

lcFoxPath = Replace(WScript.ScriptFullName, WScript.ScriptName, "")
lcCfg = lcFoxPath & "foxbin2prg.cfg"

Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(lcListFile) Then
	WScript.Echo "Lista nao encontrada: " & lcListFile
	WScript.Quit 1
End If

On Error Resume Next
Set oVFP9 = CreateObject("VisualFoxPro.Application.9")
If Err.Number <> 0 Then
	WScript.Echo "Erro: Visual FoxPro 9 nao encontrado."
	WScript.Quit 1
End If
oVFP9.DoCmd("CD """ & lcFoxPath & """")
On Error Goto 0

nLast = 0
nCount = 0
Set ts = fso.OpenTextFile(lcListFile, ForReading, False, FormatUnicode)
Do Until ts.AtEndOfStream
	lcLine = Trim(ts.ReadLine)
	If Len(lcLine) > 0 Then
		' Pausa cooperativa: aguarda enquanto a extensao mantiver o arquivo de pausa.
		If Len(lcPauseFile) > 0 Then
			Do While fso.FileExists(lcPauseFile)
				WScript.Sleep PauseSleepMs
			Loop
		End If
		nCount = nCount + 1
		If Len(lcStatusFile) > 0 Then
			On Error Resume Next
			Set oStatus = fso.CreateTextFile(lcStatusFile, True)
			oStatus.Write nCount & "|" & fso.GetFileName(lcLine)
			oStatus.Close
			On Error Goto 0
		End If
		On Error Resume Next
		' Params: arquivo, direcao, TextName, GenText=.F., DontShowErrors=.T., Debug=.F.,
		'         DontShowProgress=.T., OriginalFileName, Recompile(vazio=Justpath), NoTimestamps=.F., CFG, OutputFolder
		oVFP9.DoCmd("DO foxbin2prg.prg WITH """ & Replace(lcLine, """", """""") & """, """ & lcDirection & """, """", .F., .T., .F., .T., """", """", .F., """ & Replace(lcCfg, """", """""") & """, """"")
		If Err.Number <> 0 Then nLast = 1
		On Error Goto 0
	End If
Loop
ts.Close

On Error Resume Next
oVFP9.DoCmd("CLEAR ALL")
Set oVFP9 = Nothing
On Error Goto 0

WScript.Quit nLast
