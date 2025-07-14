*------------------------------------------
* nFox.dev - Marco Plaza, 2025
*------------------------------------------
Lparameter prg2compile


Try

	Set Logerrors On
	errFile = Forceext(m.prg2compile,'err')
	Compile (m.prg2compile)
	If File(m.errFile)
		Strtofile( Strconv(Filetostr(m.errFile),9),m.errFile)
	Endif

Catch To oerror
	Strtofile(Strconv(oerror.Message,9),m.errFile)
Endtry

If File(m.errFile)
	loFso = Createobject("Scripting.FileSystemObject")
	If File(m.errFile)
		loFso.MoveFile(m.errFile, m.errFile)
	Endif
Endif


Return .T.
