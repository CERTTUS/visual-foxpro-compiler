*        __________________________________________________________________
*       | Certtus Sistemas Automotivos Ltda                                |_
*       |==================================================================| |
*       | Sistema  : Maestro Plus 2.0	                                    | |
*       | Programa : GeradorDiferencasRelatorio.PRG                        | |
*       | Titulo   : 										                        | |
*       | Módulo   : 		                                                | |
*       | Descrição: Programa que efetua a leitura dos parâmetros dos 		| |
*		  | 				relatórios gerados em Crystal Reports e gera arquivo  | |
*		  |				de texto .RPA para possibilitar que o 						| |
*		  | 				Visual Source Safe mostre as diferenças.					| |
*       |__________________________________________________________________| |
*         |__________________________________________________________________|

PARAMETERS cRelatorio
PRIVATE    cRelatorio, lGerouComSucesso, cDiretorioRelatorio

	*-- [rpt2rpa] Evita modal 'overwrite?' (DSN/RPA) que trava o headless via COM.
	SET SAFETY OFF
	lGerouComSucesso = .T.
	cDiretorioRelatorio = SUBSTR(cRelatorio, 1, ATC("\", cRelatorio, OCCURS("\", cRelatorio)))			
	P_ArquivoDSNAtualizar(cDiretorioRelatorio)
	
	********************************************************
	* Manutenção do arquivo, instacia o objeto do windows, *
	* Caso o arquivo exista será desatributado e deletado  *
	********************************************************
		oFSO = CreateObject("Scripting.FileSystemObject")
		cArquivoGerado = SUBSTR(cRelatorio, 1, LEN(cRelatorio) - 4) + ".RPA"
		IF oFSO.FileExists(cArquivoGerado) THEN
			oFSO.GetFile(cArquivoGerado).Attributes = 32
			oFSO.DeleteFile(cArquivoGerado, .T.) 
		ENDIF

		cArquivoGerado = "'" + cArquivoGerado + "'"
		SET DEVICE TO FILE &cArquivoGerado
		SET DEVICE TO SCREEN

	********************
	* Abre o relatório *
	********************			
		oCrystal = CREATEOBJECT("CrystalRuntime.Application.11")
		oRelatorio = oCrystal.OpenReport(cRelatorio)
		*-- [rpt2rpa] Headless: suprime prompt de parametros e barra de progresso
		*   do Crystal (modais que travam a automacao COM). NAO usa SetLogOnInfo
		*   para nao alterar a connection do relatorio (mantem o FILEDSN original).
		TRY
			oRelatorio.EnableParameterPrompting = .F.
		CATCH
		ENDTRY
		TRY
			oRelatorio.DisplayProgressDialog = .F.
		CATCH
		ENDTRY

	***************************************
	* Imprime informações dos relatórios. *
	***************************************
		F_MontarCabecalho()
		F_ImprimirGeral()
		F_ImprimirRunningTotals(oRelatorio.RunningTotalFields)
		F_ImprimirAgrupamentos(oRelatorio.GroupNameFields)
		F_ImprimirSecoes(oRelatorio.Sections)
		F_ImprimirParametros(oRelatorio.ParameterFields)
		F_ImprimirTabelas()
		F_ImprimirSQL(@oRelatorio)
		F_ImprimirFormulas(oRelatorio.FormulaFields)		

      P_ImprimirSubReports(oRelatorio.Sections)

	********************************
	* Libera relatório da memória. *
	********************************
		WAIT CLEAR
		RELEASE oCrystal, oRelatorio

AddProperty(_screen, "o_Rpt2Rpa_ExitCode", 0)
	_screen.o_Rpt2Rpa_ExitCode = IIF(lGerouComSucesso, 0, 1)

	RETURN(lGerouComSucesso)

************************
FUNCTION F_ImprimirGeral
************************

	WAIT WINDOW "Verificando configurações gerais..." NOWAIT 

	CREATE CURSOR CursorGeral (Texto MEMO)

	INSERT INTO CursorGeral (Texto) VALUES ("")
	INSERT INTO CursorGeral (Texto) VALUES ("*********************        Geral        *********************" + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ApplicationName: " + ALLTRIM(oRelatorio.ApplicationName) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("BottomMargin: " + ALLTRIM(STR(oRelatorio.BottomMargin, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("CanPerformGroupingOnServer: " + IIF(oRelatorio.CanPerformGroupingOnServer, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("CaseInsensitiveSQLData: " +  IIF(oRelatorio.CaseInsensitiveSQLData, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ConvertDateTimeType: " + ALLTRIM(STR(oRelatorio.ConvertDateTimeType, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ConvertNullFieldToDefault: " + IIF(oRelatorio.ConvertNullFieldToDefault, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("DisplayProgressDialog: " + IIF(oRelatorio.DisplayProgressDialog, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("DriverName: " + ALLTRIM(oRelatorio.DriverName) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("EnableAsyncQuery: " + IIF(oRelatorio.EnableAsyncQuery, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("EnableGeneratingDataForHiddenObject: " + IIF(oRelatorio.EnableGeneratingDataForHiddenObject, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("EnableParameterPrompting: " + IIF(oRelatorio.EnableParameterPrompting, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("EnablePerformQueriesAsynchronously: " + IIF(oRelatorio.EnablePerformQueriesAsynchronously, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("EnableSelectDistinctRecords: " + IIF(oRelatorio.EnableSelectDistinctRecords, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("FieldMappingType: " + ALLTRIM(STR(oRelatorio.FieldMappingType, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("FormulaSyntax: " + ALLTRIM(STR(oRelatorio.FormulaSyntax, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("GroupSelectionFormula: " + ALLTRIM(oRelatorio.GroupSelectionFormula) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("HasSavedData: " + IIF(oRelatorio.HasSavedData, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("KeyWordsInreport: " + ALLTRIM(oRelatorio.KeyWordsInreport) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("Kind: " + ALLTRIM(STR(oRelatorio.Kind, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("LastGetFormulaSyntax: " + ALLTRIM(STR(oRelatorio.LastGetFormulaSyntax, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("LeftMargin: " + ALLTRIM(STR(oRelatorio.LeftMargin, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("NeedUpdatePages: " + IIF(oRelatorio.NeedUpdatePages, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("MorePrintEngineErrorMessages: " + IIF(oRelatorio.MorePrintEngineErrorMessages, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("NumberOfGroup: " + ALLTRIM(STR(oRelatorio.NumberOfGroup, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("PaperOrientation: " + ALLTRIM(STR(oRelatorio.PaperOrientation, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("PaperSize: " + ALLTRIM(STR(oRelatorio.PaperSize, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("PaperSource: " + ALLTRIM(STR(oRelatorio.PaperSource, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("PerformGroupingOnServer: " + IIF(oRelatorio.PerformGroupingOnServer, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("PortName: " + ALLTRIM(oRelatorio.PortName) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("PrintDate: " + DTOC(oRelatorio.PrintDate) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("PrinterDuplex: " + ALLTRIM(STR(oRelatorio.PrinterDuplex, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("PrinterName: " + ALLTRIM(oRelatorio.PrinterName) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("RecordSelectionFormula: " + ALLTRIM(oRelatorio.RecordSelectionFormula) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ReportAuthor: " + ALLTRIM(oRelatorio.ReportAuthor) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ReportComments: " + ALLTRIM(oRelatorio.ReportComments) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ReportFormatStyle: " + ALLTRIM(STR(oRelatorio.ReportFormatStyle, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ReportSubject: " + ALLTRIM(oRelatorio.ReportSubject) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ReportTemplate: " + ALLTRIM(oRelatorio.ReportTemplate) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("ReportTitle: " + ALLTRIM(oRelatorio.ReportTitle) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("RightMargin: " + ALLTRIM(STR(oRelatorio.RightMargin, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("SavePreviewPicture: " + IIF(oRelatorio.SavePreviewPicture, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("TopMargin: " + ALLTRIM(STR(oRelatorio.TopMargin, 8, 0)) + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("TranslateDosMemos: " + IIF(oRelatorio.TranslateDosMemos, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("TranslateDosStrings: " + IIF(oRelatorio.TranslateDosStrings, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("UseIndexForSpeed: " + IIF(oRelatorio.UseIndexForSpeed, "T", "F") + CHR(13) + CHR(10))
	INSERT INTO CursorGeral (Texto) VALUES ("VerifyOnEveryPrint: " + IIF(oRelatorio.VerifyOnEveryPrint, "T", "F") + CHR(13) + CHR(10))	
	INSERT INTO CursorGeral (Texto) VALUES ("")
	INSERT INTO CursorGeral (Texto) VALUES ("*********************        Geral    FIM *********************" + CHR(13) + CHR(10))
	
	SELECT CursorGeral
	SCAN
		COPY MEMO CursorGeral.Texto TO &cArquivoGerado ADDITIVE
	ENDSCAN

RETURN

********************************
FUNCTION F_ImprimirRunningTotals
********************************
PARAMETERS oRelatorioRunningTotalFields
PRIVATE    oRelatorioRunningTotalFields, nQuantidadeTotais, nContadorRunningTotals

	WAIT WINDOW "Verificando totalizadores..." NOWAIT

	TRY 

		nQuantidadeTotais = oRelatorioRunningTotalFields.Count

		IF nQuantidadeTotais > 0 THEN

			CREATE CURSOR CursorRunningTotals (Texto M)

			INSERT INTO CursorRunningTotals (Texto) VALUES ("" + CHR(13) + CHR(10))
			INSERT INTO CursorRunningTotals (Texto) VALUES ("*********************        Totais        *********************" + CHR(13) + CHR(10))

			FOR nContadorRunningTotals = 1 TO nQuantidadeTotais

				INSERT INTO CursorRunningTotals (Texto) VALUES ("" + CHR(13) + CHR(10))
				INSERT INTO CursorRunningTotals (Texto) VALUES ("Name: " + ALLTRIM(oRelatorioRunningTotalFields.Item(nContadorRunningTotals).Name) + CHR(13) + CHR(10))
				INSERT INTO CursorRunningTotals (Texto) VALUES ("RunningTotalFieldName: " + oRelatorioRunningTotalFields.Item(nContadorRunningTotals).RunningTotalFieldName + CHR(13) + CHR(10))

			ENDFOR

			INSERT INTO CursorRunningTotals (Texto) VALUES ("" + CHR(13) + CHR(10))
			INSERT INTO CursorRunningTotals (Texto) VALUES ("*********************        Totais    FIM *********************" + CHR(13) + CHR(10))

			SELECT CursorRunningTotals
			SCAN
				COPY MEMO CursorRunningTotals.Texto TO &cArquivoGerado ADDITIVE
			ENDSCAN

		ENDIF

	CATCH TO oExcecao

		P_Rpt2RpaErro("Erro de geração de arquivo texto do relatório:" + CHR(13) + oExcecao.Message, 16)
		lGerouComSucesso = .F.

	ENDTRY

	RELEASE oRelatorioRunningTotalFields

RETURN

*******************************
FUNCTION F_ImprimirAgrupamentos
*******************************
PARAMETERS oRelatorioGroupNameFields
PRIVATE    oRelatorioGroupNameFields, nQuantidadeAgrupamentos, nContadorAgrupamentos

	WAIT WINDOW "Verificando agrupamentos..." NOWAIT 

	nQuantidadeAgrupamentos = oRelatorioGroupNameFields.Count

	IF nQuantidadeAgrupamentos > 0 THEN

		CREATE CURSOR CursorGroupNameFields (Texto M)

		INSERT INTO CursorGroupNameFields (Texto) VALUES ("" + CHR(13) + CHR(10))
		INSERT INTO CursorGroupNameFields (Texto) VALUES ("*********************    Agrupamentos     *********************" + CHR(13) + CHR(10))

		FOR nContadorAgrupamentos = 1 TO nQuantidadeAgrupamentos

			INSERT INTO CursorGroupNameFields (Texto) VALUES ("")		
			INSERT INTO CursorGroupNameFields (Texto) VALUES ("Name: " + ALLTRIM(oRelatorioGroupNameFields.Item(nContadorAgrupamentos).Name) + CHR(13) + CHR(10))
			INSERT INTO CursorGroupNameFields (Texto) VALUES ("GroupNameFieldName: " + ALLTRIM(oRelatorioGroupNameFields.Item(nContadorAgrupamentos).GroupNameFieldName) + CHR(13) + CHR(10))
			INSERT INTO CursorGroupNameFields (Texto) VALUES ("GroupNumber: " + ALLTRIM(STR(oRelatorioGroupNameFields.Item(nContadorAgrupamentos).GroupNumber, 8, 0)) + CHR(13) + CHR(10))
			INSERT INTO CursorGroupNameFields (Texto) VALUES ("GroupNameConditionFormula: " + ALLTRIM(oRelatorioGroupNameFields.Item(nContadorAgrupamentos).GroupNameConditionFormula) + CHR(13) + CHR(10))

		ENDFOR

		INSERT INTO CursorGroupNameFields (Texto) VALUES ("" + CHR(13) + CHR(10))
		INSERT INTO CursorGroupNameFields (Texto) VALUES ("*********************    Agrupamentos FIM *********************" + CHR(13) + CHR(10))

		SELECT CursorGroupNameFields
		SCAN
			COPY MEMO CursorGroupNameFields.Texto TO &cArquivoGerado ADDITIVE
		ENDSCAN

	ENDIF

	RELEASE oRelatorioGroupNameFields

RETURN

*************************
FUNCTION F_ImprimirSecoes
*************************
PARAMETERS oRelatorioSections
PRIVATE    oRelatorioSections, nQuantidadeSecoes, nContadorSecao, oRelatorioReportObjects, nQuantidadeObjetos, nContadorObjetos

	WAIT WINDOW "Verificando seções..." NOWAIT 

	nQuantidadeSecoes = oRelatorioSections.Count

	IF nQuantidadeSecoes > 0

		CREATE CURSOR CursorSections (Texto M)

		INSERT INTO CursorSections (Texto) VALUES ("" + CHR(13) + CHR(10))
		INSERT INTO CursorSections (Texto) VALUES ("*********************        Seções         *********************" + CHR(13) + CHR(10))

		FOR nContadorSecao = 1 TO nQuantidadeSecoes

			INSERT INTO CursorSections (Texto) VALUES ("Name: " + ALLTRIM(oRelatorioSections.Item(nContadorSecao).Name) + CHR(13) + CHR(10))
*!*				INSERT INTO CursorSections (Texto) VALUES ("BackColor: " + ALLTRIM(STR(oRelatorioSections.Item(nContadorSecao).BackColor, 8, 0)) + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("Height: " + ALLTRIM(STR(oRelatorioSections.Item(nContadorSecao).Height, 8, 0)) + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("Width: " + ALLTRIM(STR(oRelatorioSections.Item(nContadorSecao).Width, 8, 0)) + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("KeepTogether: " + IIF(oRelatorioSections.Item(nContadorSecao).KeepTogether, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("MinimumHeight: " + ALLTRIM(STR(oRelatorioSections.Item(nContadorSecao).MinimumHeight, 8, 0)) + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("NewPageAfter: " + IIF(oRelatorioSections.Item(nContadorSecao).NewPageAfter, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("NewPageBefore: " + IIF(oRelatorioSections.Item(nContadorSecao).NewPageBefore, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("Number: " + ALLTRIM(STR(oRelatorioSections.Item(nContadorSecao).Number, 8, 0)) + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("PrintAtBottomOfPage: " + IIF(oRelatorioSections.Item(nContadorSecao).PrintAtBottomOfPage, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("ResetPageNumberAfter: " + IIF(oRelatorioSections.Item(nContadorSecao).ResetPageNumberAfter, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("Suppress: " + IIF(oRelatorioSections.Item(nContadorSecao).Suppress, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("SuppressIfBlank: " + IIF(oRelatorioSections.Item(nContadorSecao).SuppressIfBlank, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorSections (Texto) VALUES ("UnderlaySection: " + IIF(oRelatorioSections.Item(nContadorSecao).UnderlaySection, "T", "F") + CHR(13) + CHR(10))

			***********
			* Objetos *
			***********
			   oRelatorioReportObjects = oRelatorioSections.Item(nContadorSecao).ReportObjects
				nQuantidadeObjetos = oRelatorioReportObjects.Count	

				IF nQuantidadeObjetos > 0 THEN

					INSERT INTO CursorSections (Texto) VALUES ("" + CHR(13) + CHR(10))
					INSERT INTO CursorSections (Texto) VALUES ("   ** Objetos     **" + CHR(13) + CHR(10))

					FOR nContadorObjetos = 1 TO nQuantidadeObjetos

						INSERT INTO CursorSections (Texto) VALUES ("      Name: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Name) + CHR(13) + CHR(10))

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).AmPmType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         AmPmType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).AmPmType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).AmString") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         AmString: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).AmString) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).BackColor") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         BackColor: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).BackColor, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).BooleanOutputType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         BooleanOutputType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).BooleanOutputType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).BorderColor") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         BorderColor: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).BorderColor, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Bottom") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Bottom: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Bottom, 8, 0)) + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).BottomCropping") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         BottomCropping: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).BottomCropping, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).BottomLineStyle") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         BottomLineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).BottomLineStyle, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).CanGrow") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         CanGrow: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).CanGrow, "T", "F") + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).CharacterSpacing") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         CharacterSpacing: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).CharacterSpacing, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).CloseAtPageBreak") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         CloseAtPageBreak: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).CloseAtPageBreak, "T", "F") + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).ConditionFormula") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         ConditionFormula: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).ConditionFormula) + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).CssClass") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         CssClass: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).CssClass) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).CurrencyPositionType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         CurrencyPositionType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).CurrencyPositionType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).CurrencySymbol") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         CurrencySymbol: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).CurrencySymbol) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).CurrencySymbolType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         CurrencySymbolType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).CurrencySymbolType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DateCalendarType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DateCalendarType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).DateCalendarType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DateEraType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DateEraType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).DateEraType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DateFirstSeparator") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DateFirstSeparator: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).DateFirstSeparator) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DateOrder") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DateOrder: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).DateOrder, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DatePrefixSeparator") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DatePrefixSeparator: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).DatePrefixSeparator) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DateSecondSeparator") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DateSecondSeparator: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).DateSecondSeparator) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DateSuffixSeparator") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DateSuffixSeparator: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).DateSuffixSeparator) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DateWindowsDefaultType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DateWindowsDefaultType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).DateWindowsDefaultType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DayType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DayType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).DayType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DecimalPlaces") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DecimalPlaces: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).DecimalPlaces, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DecimalSymbol") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DecimalSymbol: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).DecimalSymbol) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).DisplayReverseSign") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         DisplayReverseSign: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).DisplayReverseSign, "T", "F") + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).EnableTightHorizontal") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         EnableTightHorizontal: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).EnableTightHorizontal, "T", "F") + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).ExtendToBottomOfSection") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         ExtendToBottomOfSection: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).ExtendToBottomOfSection, "T", "F") + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field") <> "U" THEN

							INSERT INTO CursorSections (Texto) VALUES ("         Field Name: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Field.Name) + CHR(13) + CHR(10))

							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.CurrentValue") <> "U" THEN
								INSERT INTO CursorSections (Texto) VALUES ("               CurrentValue: " + F_TiposDadosTratar(oRelatorioReportObjects.Item(nContadorObjetos).Field.CurrentValue) + CHR(13) + CHR(10))
							ENDIF

							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.DefaultValue") <> "U" THEN
								INSERT INTO CursorSections (Texto) VALUES ("               DefaultValue: " + F_TiposDadosTratar(oRelatorioReportObjects.Item(nContadorObjetos).Field.DefaultValue) + CHR(13) + CHR(10))
							ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.DisallowEditing") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               DisallowEditing: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.DisallowEditing, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.DiscreteOrRangeKind") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               DiscreteOrRangeKind: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.DiscreteOrRangeKind, 8, 0)) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.EditMask") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               EditMask: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Field.EditMask) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableExclusiveGroup") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               EnableExclusiveGroup: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableExclusiveGroup, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableMultipleValues") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               EnableMultipleValues: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableMultipleValues, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableNullValue") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               EnableNullValue: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableNullValue, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableRangeLimit") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               EnableRangeLimit: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableRangeLimit, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableShowDescriptionOnly") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               EnableShowDescriptionOnly: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableShowDescriptionOnly, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableSortBasedOnDesc") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               EnableSortBasedOnDesc: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.EnableSortBasedOnDesc, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.FormulaFieldName") <> "U" THEN
								INSERT INTO CursorSections (Texto) VALUES ("               FormulaFieldName: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Field.FormulaFieldName) + CHR(13) + CHR(10))
							ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.GroupNumber") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               GroupNumber: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.GroupNumber, 8, 0)) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.IsCurrentValueSet") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               IsCurrentValueSet: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.IsCurrentValueSet, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.IsDefaultValueSet") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               IsDefaultValueSet: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.IsDefaultValueSet, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.Kind") <> "U" THEN
								INSERT INTO CursorSections (Texto) VALUES ("               Kind: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.Kind, 8, 0)) + CHR(13) + CHR(10))
							ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.MaximumValue") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               MaximumValue: " + F_TiposDadosTratar(oRelatorioReportObjects.Item(nContadorObjetos).Field.MaximumValue) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.MinimumValue") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               MinimumValue: " + F_TiposDadosTratar(oRelatorioReportObjects.Item(nContadorObjetos).Field.MinimumValue) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.NeedsCurrentValue") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               NeedsCurrentValue: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.NeedsCurrentValue, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.NextValue") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               NextValue: " + F_TiposDadosTratar(oRelatorioReportObjects.Item(nContadorObjetos).Field.NextValue) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.NumberOfBytes") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               NumberOfBytes: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.NumberOfBytes, 8, 0)) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.NumberOfCurrentRanges") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               NumberOfCurrentRanges: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.NumberOfCurrentRanges, 8, 0)) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.NumberOfCurrentValues") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               NumberOfCurrentValues: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.NumberOfCurrentValues, 8, 0)) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.NumberOfDefaultValues") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               NumberOfDefaultValues: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.NumberOfDefaultValues, 8, 0)) + CHR(13) + CHR(10))
*!*								ENDIF

							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.ParameterFieldName") <> "U" THEN
								INSERT INTO CursorSections (Texto) VALUES ("               ParameterFieldName: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Field.ParameterFieldName) + CHR(13) + CHR(10))
							ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.ParameterType") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               ParameterType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.ParameterType, 8, 0)) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.PickListSortMethod") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               PickListSortMethod: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.PickListSortMethod, 8, 0)) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.PlaceInGroup") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               PlaceInGroup: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Field.PlaceInGroup, "T", "F") + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.PreviousValue") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               PreviousValue: " + F_TiposDadosTratar(oRelatorioReportObjects.Item(nContadorObjetos).Field.PreviousValue) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.Prompt") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               Prompt: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Field.Prompt) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.ReportName") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               ReportName: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Field.ReportName) + CHR(13) + CHR(10))
*!*								ENDIF

							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.Text") <> "U" THEN
								INSERT INTO CursorSections (Texto) VALUES ("               Text: " + STRTRAN(ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Field.Text), CHR(13) + CHR(10), CHR(13) + CHR(10) + SPACE(21)) + CHR(13) + CHR(10))
							ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.Value") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               Value: " + F_TiposDadosTratar(oRelatorioReportObjects.Item(nContadorObjetos).Field.Value) + CHR(13) + CHR(10))
*!*								ENDIF

*!*								IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Field.ValueType") <> "U" THEN
*!*									INSERT INTO CursorSections (Texto) VALUES ("               ValueType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Field.ValueType, 8, 0)) + CHR(13) + CHR(10))							
*!*								ENDIF
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).FirstLineIndent") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         FirstLineIndent: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).FirstLineIndent, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Font") <> "U" THEN

							INSERT INTO CursorSections (Texto) VALUES ("         Font Name: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Font.Name) + CHR(13) + CHR(10))
							INSERT INTO CursorSections (Texto) VALUES ("         Font Bold: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Font.Bold, "T", "F") + CHR(13) + CHR(10))
							INSERT INTO CursorSections (Texto) VALUES ("         Font CharSet: " +  ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Font.CharSet, 8, 0))  + CHR(13) + CHR(10))
							INSERT INTO CursorSections (Texto) VALUES ("         Font Italic: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Font.Italic, "T", "F") + CHR(13) + CHR(10))
							INSERT INTO CursorSections (Texto) VALUES ("         Font StrikethRough: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Font.StrikethRough, "T", "F") + CHR(13) + CHR(10))
							INSERT INTO CursorSections (Texto) VALUES ("         Font Underline: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Font.Underline, "T", "F") + CHR(13) + CHR(10))
							INSERT INTO CursorSections (Texto) VALUES ("         Font Weight: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Font.Weight, 8, 0)) + CHR(13) + CHR(10))

						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).FormattedPicture") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         FormattedPicture: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).FormattedPicture, "T", "F") + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).HasDropShadow") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         HasDropShadow: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).HasDropShadow, "T", "F") + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Height") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Height: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Height, 8, 0))+ CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).HorAlignment") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         HorAlignment: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).HorAlignment, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).HourMinuteSeparator") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         HourMinuteSeparator: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).HourMinuteSeparator) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).HourType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         HourType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).HourType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).HyperLinkText") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         HyperLinkText: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).HyperLinkText)+ CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).HyperLinkType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         HyperLinkType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).HyperLinkType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).KeepToGether") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         KeepToGether: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).KeepToGether, "T", "F") + CHR(13) + CHR(10))
						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Kind") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Kind: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Kind, 8, 0)) + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LeadingDayPosition") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LeadingDayPosition: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LeadingDayPosition, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LeadingDaySeparator") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LeadingDaySeparator: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).LeadingDaySeparator) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LeadingDayType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LeadingDayType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LeadingDayType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Left") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Left: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Left, 8, 0)) + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LeftIndent") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LeftIndent: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LeftIndent, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LeftLineStyle") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LeftLineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LeftLineStyle, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LineColor") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LineColor: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LineColor, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LineStyle") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LineStyle, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LineSpacing") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LineSpacing: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LineSpacing, 16, 10)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LineSpacingType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LineSpacingType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LineSpacingType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).LineThickness") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         LineThickness: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).LineThickness, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).MaxNumberOfLines") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         MaxNumberOfLines: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).MaxNumberOfLines, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).MinuteSecondSeparator") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         MinuteSecondSeparator: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).MinuteSecondSeparator) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).MinuteType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         MinuteType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).MinuteType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).MonthType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         MonthType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).MonthType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).NegativeType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         NegativeType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).NegativeType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).PmString") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         PmString: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).PmString) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Right") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Right: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Right, 8, 0)) + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).RightIndent") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         RightIndent: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).RightIndent, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).RightLineStyle") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         RightLineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).RightLineStyle, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).RoundingType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         RoundingType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).RoundingType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).SecondType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         SecondType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).SecondType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Suppress") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Suppress: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).Suppress, "T", "F") + CHR(13) + CHR(10))
						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).SuppressIfDuplicated") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         SuppressIfDuplicated: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).SuppressIfDuplicated, "T", "F") + CHR(13) + CHR(10))
						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).SuppressIfZero") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         SuppressIfZero: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).SuppressIfZero, "T", "F") + CHR(13) + CHR(10))
						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Text") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Text: " + STRTRAN(ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).Text), CHR(13) + CHR(10), CHR(13) + CHR(10) + SPACE(15)) + CHR(13) + CHR(10))
						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).TextColor") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         TextColor: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).TextColor, 8, 0)) + CHR(13) + CHR(10))
						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).TextFormat") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         TextFormat: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).TextFormat, 8, 0)) + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).TextRotationAngle") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         TextRotationAngle: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).TextRotationAngle, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).ThousandsSeparators") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         ThousandsSeparators: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).ThousandsSeparators, "T", "F") + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).ThousandSymbol") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         ThousandSymbol: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).ThousandSymbol) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).TimeBase") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         TimeBase: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).TimeBase, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Top") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Top: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Top, 8, 0)) + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).TopCropping") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         TopCropping: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).TopCropping, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).TopLineStyle") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         TopLineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).TopLineStyle, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).UseLeadingZero") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         UseLeadingZero: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).UseLeadingZero, "T", "F") + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).UseOneSymbolPerPage") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         UseOneSymbolPerPage: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).UseOneSymbolPerPage, "T", "F") + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).UseSystemDefaults") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         UseSystemDefaults: " + IIF(oRelatorioReportObjects.Item(nContadorObjetos).UseSystemDefaults, "T", "F") + CHR(13) + CHR(10))
						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).Width") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         Width: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).Width, 8, 0)) + CHR(13) + CHR(10))
						ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).YearType") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         YearType: " + ALLTRIM(STR(oRelatorioReportObjects.Item(nContadorObjetos).YearType, 8, 0)) + CHR(13) + CHR(10))
*!*							ENDIF

*!*							IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).ZeroValueString") <> "U" THEN
*!*								INSERT INTO CursorSections (Texto) VALUES ("         ZeroValueString: " + ALLTRIM(oRelatorioReportObjects.Item(nContadorObjetos).ZeroValueString) + CHR(13) + CHR(10))
*!*							ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).XScaling") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         XScaling: " + ALLTRIM(STRTRAN(STR(oRelatorioReportObjects.Item(nContadorObjetos).XScaling, 16, 10), ",", ".")) + CHR(13) + CHR(10))
						ENDIF

						IF TYPE("oRelatorioReportObjects.Item(nContadorObjetos).YScaling") <> "U" THEN
							INSERT INTO CursorSections (Texto) VALUES ("         YScaling: " + ALLTRIM(STRTRAN(STR(oRelatorioReportObjects.Item(nContadorObjetos).YScaling, 16, 10), ",", ".")) + CHR(13) + CHR(10))
						ENDIF

					ENDFOR

					INSERT INTO CursorSections (Texto) VALUES ("" + CHR(13) + CHR(10))
					INSERT INTO CursorSections (Texto) VALUES ("   ** Objetos FIM **" + CHR(13) + CHR(10))

				ENDIF

		ENDFOR

		INSERT INTO CursorSections (Texto) VALUES ("" + CHR(13) + CHR(10))
		INSERT INTO CursorSections (Texto) VALUES ("*********************        Seções     FIM *********************" + CHR(13) + CHR(10))

		SELECT CursorSections
		SCAN
			COPY MEMO CursorSections.Texto TO &cArquivoGerado ADDITIVE
		ENDSCAN

	ENDIF 

	RELEASE oRelatorioSections, oRelatorioReportObjects

RETURN

*****************************
FUNCTION F_ImprimirParametros
*****************************
PARAMETERS oRelatorioParameterFields
PRIVATE    oRelatorioParameterFields, nQuantidadeParametros, nQuantidadeParametros

	WAIT WINDOW "Verificando parametrização..." NOWAIT 

	nQuantidadeParametros = oRelatorioParameterFields.Count

	IF nQuantidadeParametros > 0 THEN

		CREATE CURSOR CursorParameterFields (Texto M)

		INSERT INTO CursorParameterFields (Texto) VALUES ("" + CHR(13) + CHR(10))
		INSERT INTO CursorParameterFields (Texto) VALUES ("*********************      Parâmetros      *********************" + CHR(13) + CHR(10))

		FOR nContadorParametros = 1 TO nQuantidadeParametros

			INSERT INTO CursorParameterFields (Texto) VALUES ("" + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("Name: " + ALLTRIM(oRelatorioParameterFields.Item(nContadorParametros).Name) + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("ParameterFieldName: " + ALLTRIM(oRelatorioParameterFields.Item(nContadorParametros).ParameterFieldName) + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("DisallowEditing: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).DisallowEditing, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("EditMask: " + ALLTRIM(oRelatorioParameterFields.Item(nContadorParametros).EditMask) + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("EnableExclusiveGroup: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).EnableExclusiveGroup, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("EnableMultipleValues: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).EnableMultipleValues, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("EnableNullValue: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).EnableNullValue, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("EnableRangeLimit: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).EnableRangeLimit, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("EnableShowDescriptionOnly: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).EnableShowDescriptionOnly, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("EnableSortBasedOnDesc: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).EnableSortBasedOnDesc, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("IsCurrentValueSet: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).IsCurrentValueSet, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("IsDefaultValueSet: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).IsDefaultValueSet, "T", "F") + CHR(13) + CHR(10))			
			INSERT INTO CursorParameterFields (Texto) VALUES ("MaximumValue: " + IIF(ISNULL(oRelatorioParameterFields.Item(nContadorParametros).MaximumValue), "", F_TiposDadosTratar(oRelatorioParameterFields.Item(nContadorParametros).MaximumValue)) + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("MinimumValue: " + IIF(ISNULL(oRelatorioParameterFields.Item(nContadorParametros).MinimumValue), "", F_TiposDadosTratar(oRelatorioParameterFields.Item(nContadorParametros).MinimumValue)) + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("NeedsCurrentValue: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).NeedsCurrentValue, "T", "F") + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("PlaceInGroup: " + IIF(oRelatorioParameterFields.Item(nContadorParametros).PlaceInGroup, "T", "F") + CHR(13) + CHR(10))
*!*				INSERT INTO CursorParameterFields (Texto) VALUES ("Prompt: " + ALLTRIM(oRelatorioParameterFields.Item(nContadorParametros).Prompt) + CHR(13) + CHR(10))
*!*				INSERT INTO CursorParameterFields (Texto) VALUES ("ReportName: " + ALLTRIM(oRelatorioParameterFields.Item(nContadorParametros).ReportName) + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("ValueType: " + F_TipoDados(oRelatorioParameterFields.Item(nContadorParametros).ValueType) + CHR(13) + CHR(10))
			INSERT INTO CursorParameterFields (Texto) VALUES ("DefaultValue: " + F_TiposDadosTratar(oRelatorioParameterFields.Item(nContadorParametros).DefaultValue) + CHR(13) + CHR(10))

		ENDFOR

		INSERT INTO CursorParameterFields (Texto) VALUES ("" + CHR(13) + CHR(10))
		INSERT INTO CursorParameterFields (Texto) VALUES ("*********************      Parâmetros  FIM *********************" + CHR(13) + CHR(10))

		SELECT CursorParameterFields
		SCAN
			COPY MEMO CursorParameterFields.Texto TO &cArquivoGerado ADDITIVE
		ENDSCAN

	ENDIF

	RELEASE oRelatorioParameterFields

RETURN

**************************
FUNCTION F_ImprimirTabelas
**************************

	WAIT WINDOW "Verificando estrutura do banco de dados..." NOWAIT 

	CREATE CURSOR CursorTabelas (Name M					  , ;
										  ConnectBufferString M, ;
										  DecriptiveName M	  , ;
										  DllName M				  , ;
										  Location M 			  , ;
										  LogOnDatabaseName M  , ;
										  LogOnServerName M 	  , ;
										  LogOnUserID M		  , ;
										  SessionUserID M		  , ;
										  SubLocation M)

	CREATE CURSOR CursorCampos (Name M					  	  	, ;
										 DatabaseFieldDisplayName M, ;
										 DatabaseFieldName M	  	  	, ;
										 TableAliasName M			  	, ;
										 ValueType M )

	nQuantidadeTabelas = oRelatorio.Database.Tables.Count
	IF nQuantidadeTabelas > 0
		COPY MEMO CursorCabecalho.CaptionTabelas TO &cArquivoGerado ADDITIVE	
	ENDIF

	FOR nContadorTabelas = 1 TO nQuantidadeTabelas

		cName 					= oRelatorio.Database.Tables.Item(nContadorTabelas).Name
		cConnectBufferString = oRelatorio.Database.Tables.Item(nContadorTabelas).ConnectBufferString
		cDecriptiveName 		= oRelatorio.Database.Tables.Item(nContadorTabelas).DecriptiveName
		cDllName 				= oRelatorio.Database.Tables.Item(nContadorTabelas).DllName
		cLocation 				= oRelatorio.Database.Tables.Item(nContadorTabelas).Location
		cLogOnDatabaseName 	= oRelatorio.Database.Tables.Item(nContadorTabelas).LogOnDatabaseName
		cLogOnServerName 		= oRelatorio.Database.Tables.Item(nContadorTabelas).LogOnServerName
		cLogOnUserID 			= oRelatorio.Database.Tables.Item(nContadorTabelas).LogOnUserID
		cSessionUserID 		= oRelatorio.Database.Tables.Item(nContadorTabelas).SessionUserID
		cSubLocation 			= oRelatorio.Database.Tables.Item(nContadorTabelas).SubLocation

		INSERT INTO CursorTabelas (Name 				  	 , ;
										  	ConnectBufferString, ;
										  	DecriptiveName 	 , ;
										  	DllName 			  	 , ;
										  	Location  			 , ;
										  	LogOnDatabaseName  , ;
										  	LogOnServerName    , ;
										  	LogOnUserID 		 , ;
										  	SessionUserID 	  	 , ;
										  	SubLocation) ;
				 				 Values (cName					  , ;
				 				 		   cConnectBufferString, ;
				 				 		   cDecriptiveName	  , ;
				 				 		   cDllName				  , ;
				 				 		   cLocation			  , ;
				 				 		   cLogOnDatabaseName  , ;
				 				 		   cLogOnServerName	  , ;
				 				 		   cLogOnUserID		  , ;
				 				 		   cSessionUserID		  , ;
				 				 		   cSubLocation)
		**********
		* Campos *
		**********

			nQuantidadeCampos = oRelatorio.Database.Tables.Item(nContadorTabelas).Fields.Count

			FOR nContadorCampos = 1 TO nQuantidadeCampos	

				cName 						  = oRelatorio.Database.Tables.Item(nContadorTabelas).Fields.Item(nContadorCampos).Name
				cDatabaseFieldDisplayName = oRelatorio.Database.Tables.Item(nContadorTabelas).Fields.Item(nContadorCampos).DatabaseFieldDisplayName
				cDatabaseFieldName 		  = oRelatorio.Database.Tables.Item(nContadorTabelas).Fields.Item(nContadorCampos).DatabaseFieldName
				cTableAliasName 			  = oRelatorio.Database.Tables.Item(nContadorTabelas).Fields.Item(nContadorCampos).TableAliasName
				nValueType 					  = oRelatorio.Database.Tables.Item(nContadorTabelas).Fields.Item(nContadorCampos).ValueType 

				INSERT INTO CursorCampos (Name						  , ;
												  DatabaseFieldDisplayName, ;
												  DatabaseFieldName		  , ;
												  TableAliasName			  , ;
												  ValueType);
										VALUES (cName							, ;
												  cDatabaseFieldDisplayName, ;
												  cDatabaseFieldName			, ;
												  cTableAliasName				, ;
												  F_TipoDados(nValueType))
			ENDFOR

			COPY MEMO CursorCabecalho.CaptionName 		  			  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.Name 		  						  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionConnectBufferString TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.ConnectBufferString 			  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionDecriptiveName 	  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.DecriptiveName 				  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionDllName		  		  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.DllName		  					  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionLocation		  		  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.Location		  					  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionLogOnDatabaseName   TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.LogOnDatabaseName 		  	  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionLogOnServerName 	  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.LogOnServerName 				  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionLogOnUserID 		  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.LogOnUserID 					  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionSessionUserID 		  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.SessionUserID		  			  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorCabecalho.CaptionSubLocation		  	  TO &cArquivoGerado ADDITIVE
			COPY MEMO CursorTabelas.SubLocation		  				  TO &cArquivoGerado ADDITIVE

			SELECT CursorTabelas
			DELETE

			IF nQuantidadeCampos > 0 THEN
				COPY MEMO CursorCabecalho.CaptionCampos TO &cArquivoGerado ADDITIVE
			ENDIF

			SELECT CursorCampos
			SCAN

*				COPY MEMO CursorCabecalho.CaptionName 		  				  	 TO &cArquivoGerado ADDITIVE
*				COPY MEMO CursorCampos.Name 		  							 	 TO &cArquivoGerado ADDITIVE
*				COPY MEMO CursorCabecalho.CaptionDatabaseFieldDisplayName TO &cArquivoGerado ADDITIVE
*				COPY MEMO CursorCampos.DatabaseFieldDisplayName 		 	 TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorCabecalho.CaptionDatabaseFieldName 		 TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorCampos.DatabaseFieldName 				  	 	 TO &cArquivoGerado ADDITIVE
*				COPY MEMO CursorCabecalho.CaptionTableAliasName		  	  	 TO &cArquivoGerado ADDITIVE
*				COPY MEMO CursorCampos.TableAliasName		  				 	 TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorCabecalho.CaptionValueType		  			 TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorCampos.ValueType		  					  	 	 TO &cArquivoGerado ADDITIVE

				DELETE

			ENDSCAN

			IF nQuantidadeCampos > 0 THEN
				COPY MEMO CursorCabecalho.CaptionCamposFim TO &cArquivoGerado ADDITIVE
			ENDIF

	ENDFOR

RETURN

**********************
FUNCTION F_ImprimirSQL
**********************
PARAMETERS oRelatorio
PRIVATE    oRelatorio, cRecordSelectionFormula, pParametro

	WAIT WINDOW "Verificando SQL..." NOWAIT 

	*************************************************************************
	* Passa parâmetros para o relatório para que este possa retornar o SQL. *
	*************************************************************************
		FOR nContadorParametros = 1 TO oRelatorio.ParameterFields.Count

			*************************************************************************************
			* Se o parâmetro for exigido, adiciona o parâmetro diretamente ou adiciona no Range *
			*************************************************************************************
				IF oRelatorio.ParameterFields.Item(nContadorParametros).NeedsCurrentValue AND NOT oRelatorio.ParameterFields.Item(nContadorParametros).IsCurrentValueSet THEN

					pParametro = oRelatorio.ParameterFields.Item(nContadorParametros).DefaultValue
					IF ISNULL(pParametro) OR EMPTY(pParametro) THEN
						pParametro = F_ParametrosDefinirValor(oRelatorio.ParameterFields.Item(nContadorParametros))
					ENDIF

					IF oRelatorio.ParameterFields.Item(nContadorParametros).DiscreteOrRangeKind = 0 THEN
						oRelatorio.ParameterFields.Item(nContadorParametros).AddCurrentValue(pParametro)
					ELSE
						oRelatorio.ParameterFields.Item(nContadorParametros).AddCurrentRange(pParametro, pParametro, 1)
					ENDIF

				ENDIF

		ENDFOR

	************************************************************
	* Monta cusor com o SQL e com a fórmula de seleção do SQL. *
	************************************************************
		CREATE CURSOR CursorSQL (SQL M, RecordSelectionFormula M)
		cRecordSelectionFormula = oRelatorio.RecordSelectionFormula

		SELECT CursorSQL

		TRY 

			P_ArquivoDSNAtualizar(cDiretorioRelatorio)
			cSQL = oRelatorio.SQLQueryString

		CATCH TO oExcecao

			P_Rpt2RpaErro("Erro de geração de SQL do relatório. Verifique a estrutura do banco de dados!" + CHR(13) + oExcecao.Message, 16)

			cSQL = oExcecao.Message
			lGerouComSucesso = .F.	

		ENDTRY 

		INSERT INTO CursorSQL (SQL	, RecordSelectionFormula) ;
							VALUES (cSQL, cRecordSelectionFormula)

	****************************************************************************
	* Grava no arquivo de texto as informações do SQL e da fórmula de seleção. *
	****************************************************************************
		COPY MEMO CursorCabecalho.CaptionSQLQueryString TO &cArquivoGerado ADDITIVE
		COPY MEMO CursorSQL.SQL TO &cArquivoGerado ADDITIVE
		COPY MEMO CursorCabecalho.CaptionSQLQueryStringFim TO &cArquivoGerado ADDITIVE
		
		IF NOT EMPTY(CursorSQL.RecordSelectionFormula)
			COPY MEMO CursorCabecalho.CaptionRecordSelectionFormula TO &cArquivoGerado ADDITIVE
		ENDIF

		COPY MEMO CursorSQL.RecordSelectionFormula TO &cArquivoGerado ADDITIVE

RETURN

***************************
FUNCTION F_ImprimirFormulas
***************************
PARAMETERS oRelatorioFormulaFields
PRIVATE    oRelatorioFormulaFields, nFormulaFieldsTotal, nContadorFormulas, ;
           cFormulaFieldName, cName, cText

	WAIT WINDOW "Verificando fórmulas..." NOWAIT 

	nFormulaFieldsTotal = oRelatorioFormulaFields.Count

	IF nFormulaFieldsTotal > 0 THEN

		CREATE CURSOR CursorFormulas (FormulaFieldName M, FormulaName M, FormulaText M)

		***********************************************************************
		* Monta o cursor de acordo com a quantidade de fórmulas do relatório. *
		***********************************************************************
			FOR nContadorFormulas = 1 TO nFormulaFieldsTotal
				cFormulaFieldName = oRelatorioFormulaFields.Item(nContadorFormulas).FormulaFieldName 
				cName 				= oRelatorioFormulaFields.Item(nContadorFormulas).Name 
				cText 				= oRelatorioFormulaFields.Item(nContadorFormulas).Text 
				INSERT INTO CursorFormulas (FormulaFieldName	, FormulaName, FormulaText) ;
										  VALUES (cFormulaFieldName, cName		 , cText)
			ENDFOR
					
		***************************************************
		* Grava informações de fórmulas no arquivo texto. *
		***************************************************
			SELECT CursorFormulas
			IF NOT EOF()
				COPY MEMO CursorCabecalho.CaptionFormula TO &cArquivoGerado ADDITIVE
			ENDIF 

			SCAN

				COPY MEMO CursorCabecalho.CaptionFormulaFieldName TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorFormulas.FormulaFieldName 		  TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorCabecalho.CaptionName 	  			  TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorFormulas.FormulaName 				  TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorCabecalho.CaptionFormulaText 	  TO &cArquivoGerado ADDITIVE
				COPY MEMO CursorFormulas.FormulaText 				  TO &cArquivoGerado ADDITIVE
				IF NOT EMPTY(CursorFormulas.FormulaText)
					COPY MEMO CursorCabecalho.Espaco 				  TO &cArquivoGerado ADDITIVE
				ENDIF 

			ENDSCAN
	
	ENDIF

	RELEASE oRelatorioFormulaFields

RETURN

**************************
FUNCTION F_MontarCabecalho
**************************

************************************************************************************************
* Função que monta os cabeçalhos das propriedades do relatório que são geradas pelos cursores. *
************************************************************************************************
	WAIT WINDOW "Montado cabeçalhos..." NOWAIT

	CREATE CURSOR CursorCabecalho (CaptionTabelas Memo, ;
											 CaptionCampos Memo, ;
											 CaptionCamposFim Memo, ;
											 CaptionSQLQueryString Memo, ;
											 CaptionSQLQueryStringFim Memo, ;
											 CaptionRecordSelectionFormula Memo, ;
											 CaptionFormula Memo, ;
											 CaptionFormulaFieldName Memo, ;
											 CaptionFormulaText Memo, ;
										  	 CaptionConnectBufferString Memo, ;
										  	 CaptionDecriptiveName Memo, ;
										  	 CaptionDllName Memo, ;
										  	 CaptionLocation Memo, ;
										  	 CaptionLogOnDatabaseName Memo, ;
										  	 CaptionLogOnServerName Memo, ;
										  	 CaptionLogOnUserID Memo, ;
										  	 CaptionSessionUserID Memo, ;
										  	 CaptionSubLocation Memo, ;
											 CaptionDatabaseFieldDisplayName Memo, ;
											 CaptionDatabaseFieldName Memo, ;
											 CaptionTableAliasName Memo, ;
											 CaptionValueType Memo, ;
											 CaptionName Memo, ;
											 Espaco Memo)
											 
	TEXT TO cCaptionTabelas NOSHOW 	
                                                                          
*********************       Tabelas        *********************


	ENDTEXT	

	TEXT TO cCaptionCampos NOSHOW 	
                                  
                                                  
          *********************        Campos        *********************

	ENDTEXT

	TEXT TO cCaptionCamposFim NOSHOW
	
	
          *********************        Campos     FIM*********************
          
	ENDTEXT

	TEXT TO cCaptionSQLQueryString NOSHOW
                                  
                                   
*********************         SQL         *********************
SQLQueryString: 

	ENDTEXT
	
	TEXT TO cCaptionSQLQueryStringFIM NOSHOW
	
*********************         SQL      FIM*********************	
	
	ENDTEXT
	
	********************
	* Record Selection *
	********************
		TEXT TO cCaptionFormula NOSHOW 	
		
		
*********************       Formulas      *********************
		ENDTEXT
		
	************
	* Fórmulas *
	************
		TEXT TO cCaptionRecordSelectionFormula NOSHOW 	
		
******************** RecordSelectionFormula *******************
RecordSelectionFormula:  

		ENDTEXT		
		
		TEXT TO cCaptionFormulaFieldName NOSHOW 
        
FormulaFieldName: 
		ENDTEXT

		TEXT TO cCaptionFormulaText NOSHOW 	
            
Text:

		ENDTEXT
		
	***********
	* Tabelas *
	***********
		TEXT TO cCaptionConnectBufferString NOSHOW 
        
ConnectBufferString: 
		ENDTEXT
		TEXT TO cCaptionDecriptiveName NOSHOW 
        
DecriptiveName: 
		ENDTEXT
		TEXT TO cCaptionDllName NOSHOW 
        
DllName: 
		ENDTEXT
		TEXT TO cCaptionLocation NOSHOW 
        
Location: 
		ENDTEXT
		TEXT TO cCaptionLogOnDatabaseName NOSHOW 
        
LogOnDatabaseName: 
		ENDTEXT
		TEXT TO cCaptionLogOnServerName NOSHOW 
        
LogOnServerName: 
		ENDTEXT											
		TEXT TO cCaptionLogOnUserID NOSHOW 
        
LogOnUserID: 
		ENDTEXT
		TEXT TO cCaptionSessionUserID NOSHOW 
        
SessionUserID: 
		ENDTEXT		
		TEXT TO cCaptionSubLocation NOSHOW 
        
SubLocation: 
		ENDTEXT			
		
	**********
	* Campos *	
	**********	
		TEXT TO cCaptionDatabaseFieldDisplayName NOSHOW 
        
        
          DatabaseFieldDisplayName: 
		ENDTEXT
		TEXT TO cCaptionDatabaseFieldName NOSHOW 
                                            
          DatabaseFieldName: 
		ENDTEXT
		
		TEXT TO cCaptionTableAliasName NOSHOW 
        
          TableAliasName: 
		ENDTEXT	

		TEXT TO cCaptionValueType NOSHOW 
		        
          ValueType: 
		ENDTEXT	
	
	TEXT TO cCaptionName NOSHOW 
               
Name: 
	ENDTEXT

	TEXT TO cEspaco NOSHOW 	
                                   
                                   
                                    

	ENDTEXT
	INSERT INTO CursorCabecalho (CaptionTabelas, ;
										  CaptionCampos, ;
										  CaptionCamposFim, ;
										  CaptionSQLQueryString, ;
										  CaptionSQLQueryStringFIM, ;
										  CaptionRecordSelectionFormula, ;
										  CaptionFormula, ;
										  CaptionFormulaFieldName, ;
										  CaptionFormulaText, ;
										  CaptionConnectBufferString, ;
										  CaptionDecriptiveName, ;
										  CaptionDllName, ;
										  CaptionLocation, ;
										  CaptionLogOnDatabaseName, ;
										  CaptionLogOnServerName, ;
										  CaptionLogOnUserID, ;
										  CaptionSessionUserID, ;
										  CaptionSubLocation, ;
										  CaptionDatabaseFieldDisplayName, ;
										  CaptionDatabaseFieldName, ;
										  CaptionTableAliasName, ;
										  CaptionValueType, ;
										  CaptionName, ;
										  Espaco) ;
								VALUES (cCaptionTabelas, ;
										  cCaptionCampos, ;
										  cCaptionCamposFim, ;
										  cCaptionSQLQueryString, ;
										  cCaptionSQLQueryStringFIM, ;
										  cCaptionRecordSelectionFormula, ;
										  cCaptionFormula, ;
										  cCaptionFormulaFieldName, ;
										  cCaptionFormulaText, ;
										  cCaptionConnectBufferString, ;
										  cCaptionDecriptiveName, ;
										  cCaptionDllName, ;
										  cCaptionLocation, ;
										  cCaptionLogOnDatabaseName, ;
										  cCaptionLogOnServerName, ;
										  cCaptionLogOnUserID, ;
										  cCaptionSessionUserID, ;
										  cCaptionSubLocation, ;
										  cCaptionDatabaseFieldDisplayName, ;
										  cCaptionDatabaseFieldName, ;
										  cCaptionTableAliasName, ;
										  cCaptionValueType, ;
										  cCaptionName, ;
										  cEspaco)
RETURN

********************
FUNCTION F_TipoDados
********************
PARAMETERS nTipoDados
PRIVATE    nTipoDados, cDescricaoTipoDados

	DO CASE
		CASE nTipoDados = 5
			cDescricaoTipoDados = "INTEGER"

		CASE nTipoDados = 7
			cDescricaoTipoDados = "NUMERIC"

		CASE nTipoDados = 9
			cDescricaoTipoDados = "BOOLEAN"

		CASE nTipoDados = 10
			cDescricaoTipoDados = "DATE"

		CASE nTipoDados = 12
			cDescricaoTipoDados = "STRING"

		CASE nTipoDados = 14
			cDescricaoTipoDados = "TEXT"

		OTHERWISE
			cDescricaoTipoDados = "INDEFINIDO"

	ENDCASE

RETURN(cDescricaoTipoDados)


******************************
PROCEDURE P_ImprimirSubReports
******************************
PARAMETERS oRelatorioSections
PRIVATE    oRelatorioSections, nSectionsContador, nSectionsTotal, ;
	        oRelatorioReportObjects, nReportObjectsContador, nReportObjectsTotal, oRelatorioSubreport

	nSectionsTotal = oRelatorioSections.Count 

	FOR nSectionsContador = 1 TO nSectionsTotal

		oRelatorioSections = oRelatorio.Sections.Item(nSectionsContador)

		nReportObjectsTotal = oRelatorioSections.ReportObjects.Count

		FOR nReportObjectsContador = 1 TO nReportObjectsTotal

			oRelatorioReportObjects = oRelatorioSections.ReportObjects.Item(nReportObjectsContador)

			IF TYPE("oRelatorioReportObjects.SubreportName") == "C" THEN

				CREATE CURSOR CursorSubReport (Texto M)
				INSERT INTO CursorSubReport (Texto) VALUES ("" + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("********************* SubReport " + ALLTRIM(oRelatorioReportObjects.SubreportName) + " *********************" + CHR(13) + CHR(10))
*				INSERT INTO CursorSubReport (Texto) VALUES ("   BackColor: " + ALLTRIM(STR(oRelatorioReportObjects.BackColor, 8, 0)) + CHR(13) + CHR(10))
*				INSERT INTO CursorSubReport (Texto) VALUES ("   BorderColor: " + ALLTRIM(STR(oRelatorioReportObjects.BorderColor, 8, 0)) + CHR(13) + CHR(10))
*				INSERT INTO CursorSubReport (Texto) VALUES ("   BottomLineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.BottomLineStyle, 8, 0)) + CHR(13) + CHR(10))									
				INSERT INTO CursorSubReport (Texto) VALUES ("   CanGrow: " + IIF(oRelatorioReportObjects.CanGrow, "T", "F") + CHR(13) + CHR(10))
*				INSERT INTO CursorSubReport (Texto) VALUES ("   CloseAtPageBreak: " + IIF(oRelatorioReportObjects.CloseAtPageBreak, "T", "F") + CHR(13) + CHR(10))				
*				INSERT INTO CursorSubReport (Texto) VALUES ("   CssClass: " + ALLTRIM(oRelatorioReportObjects.CssClass) + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   EnableOnDemand: " + IIF(oRelatorioReportObjects.EnableOnDemand, "T", "F") + CHR(13) + CHR(10))
*				INSERT INTO CursorSubReport (Texto) VALUES ("   HasDropShadow: " + IIF(oRelatorioReportObjects.HasDropShadow, "T", "F") + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   Height: " + ALLTRIM(STR(oRelatorioReportObjects.Height, 8, 0)) + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   KeepTogether: " + IIF(oRelatorioReportObjects.KeepTogether, "T", "F") + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   Kind: " + ALLTRIM(STR(oRelatorioReportObjects.Kind, 8, 0)) + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   Left: " + ALLTRIM(STR(oRelatorioReportObjects.Left, 8, 0)) + CHR(13) + CHR(10))
*				INSERT INTO CursorSubReport (Texto) VALUES ("   LeftLineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.LeftLineStyle, 8, 0)) + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   Name: " + ALLTRIM(oRelatorioReportObjects.Name) + CHR(13) + CHR(10))
*				INSERT INTO CursorSubReport (Texto) VALUES ("   RightLineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.RightLineStyle, 8, 0)) + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   Suppress: " + IIF(oRelatorioReportObjects.Suppress, "T", "F") + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   Top: " + ALLTRIM(STR(oRelatorioReportObjects.Top, 8, 0)) + CHR(13) + CHR(10))
*				INSERT INTO CursorSubReport (Texto) VALUES ("   TopLineStyle: " + ALLTRIM(STR(oRelatorioReportObjects.TopLineStyle, 8, 0)) + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("   Width: " + ALLTRIM(STR(oRelatorioReportObjects.Width, 8, 0)) + CHR(13) + CHR(10))

				SELECT CursorSubReport
				SCAN
					COPY MEMO CursorSubReport.Texto TO &cArquivoGerado ADDITIVE
				ENDSCAN

				oRelatorioSubreport = oRelatorioReportObjects.OpenSubreport
				*-- [rpt2rpa] Headless: suprime prompt de parametros tambem no subrelatorio
				TRY
					oRelatorioSubreport.EnableParameterPrompting = .F.
				CATCH
				ENDTRY
				P_ImprimirLinks(oRelatorioReportObjects.Links, oRelatorioSubreport.ParameterFields, ALLTRIM(oRelatorioReportObjects.SubreportName))
				F_ImprimirSQL(oRelatorioSubreport)
				F_ImprimirParametros(oRelatorioSubreport.ParameterFields)
				F_ImprimirSecoes(oRelatorioSubreport.Sections)
				F_ImprimirFormulas(oRelatorioSubreport.FormulaFields)
				F_ImprimirRunningTotals(oRelatorioSubreport.RunningTotalFields)
				F_ImprimirAgrupamentos(oRelatorioSubreport.GroupNameFields)

				INSERT INTO CursorSubReport (Texto) VALUES ("" + CHR(13) + CHR(10))
				INSERT INTO CursorSubReport (Texto) VALUES ("********************* SubReport " + ALLTRIM(oRelatorioReportObjects.SubreportName) + " FIM *********************" + CHR(13) + CHR(10))

			ENDIF

		ENDFOR

	ENDFOR

	RELEASE oRelatorioSections, oRelatorioReportObjects, oRelatorioSubreport

ENDPROC

***************************
FUNCTION F_TiposDadosTratar
***************************
PARAMETERS pValorEntrada
PRIVATE    pValorEntrada, cType, cValorRetorno

	cType = VARTYPE(pValorEntrada)

	DO CASE
	   CASE cType == "C"
			cValorRetorno = ALLTRIM(pValorEntrada)

	   CASE cType == "N"
			cValorRetorno = ALLTRIM(STR(pValorEntrada))

		CASE INLIST(cType, "D", "T")
			cValorRetorno = DTOC(pValorEntrada)

		CASE cType == "L"
			cValorRetorno = IIF(pValorEntrada, "T", "F")

		CASE cType == "X"
			cValorRetorno = "NULL"

	ENDCASE

RETURN(cValorRetorno)

*********************************
FUNCTION F_ParametrosDefinirValor
*********************************
PARAMETERS oParameterFields
PRIVATE    oParameterFields, pParametro

	DO CASE
		CASE oParameterFields.ValueType = 7
			pParametro = 1

		CASE oParameterFields.ValueType = 8
			pParametro = 1

		CASE oParameterFields.ValueType = 9
			pParametro = .T.

		CASE oParameterFields.ValueType = 10
			pParametro = DATE()

		CASE oParameterFields.ValueType = 11
			pParametro = TIME()

		CASE oParameterFields.ValueType = 12
			pParametro = "A"

		CASE oParameterFields.ValueType = 16
			pParametro = DATETIME()

	ENDCASE

RETURN(pParametro)

*******************************
PROCEDURE P_ArquivoDSNAtualizar
*******************************
PARAMETERS cDiretorioRelatorio
PRIVATE    cDiretorioRelatorio, cDiretorioCFG

	DO WHILE OCCURS("\", cDiretorioRelatorio) > 1

		IF FILE(cDiretorioRelatorio + "CFG\CONEXAO.MEM") THEN
			EXIT
		ENDIF

		cDiretorioRelatorio = SUBSTR(cDiretorioRelatorio, 1, ATC("\", cDiretorioRelatorio, OCCURS("\", cDiretorioRelatorio) - 1))
	ENDDO

	cDiretorioCFG = cDiretorioRelatorio + "CFG\CONEXAO.MEM"

	IF NOT FILE(cDiretorioCFG) THEN
		P_Rpt2RpaErro("Arquivo CFG\CONEXAO.MEM não encontrado!" + CHR(13) + "Verifique o diretório de desenvolvimento.",16, "Atenção")
		RETURN
	ENDIF

   *************************
   * Váriaveis de controle *
   *************************
	   conn_IP   = '' && IP do servidor de banco de dados
	   conn_DB   = '' && Nome do banco de dados

		cDiretorioCFG = "'" + cDiretorioCFG + "'"
   	RESTORE FROM &cDiretorioCFG ADDITIVE

	   conn_IP   = STRTRAN(conn_IP, " ", "")
	   conn_DB   = ALLTRIM(conn_DB)

	   SET DEVI TO FILE C:\CERTTUS\CERTTUS.dsn
		   @ 00,00 SAY "[ODBC]"
		   @ 01,00 SAY "DRIVER=PostgreSQL ANSI"
		   @ 02,00 SAY "UID=crystal"
		   @ 03,00 SAY "PWD=certtus"
		   @ 04,00 SAY "EXTRASYSTABLEPREFIXES=dd_"
			@ 05,00 SAY "CANCELASFREESTMT=0"
			@ 06,00 SAY "PARSE=0"
			@ 07,00 SAY "BOOLSASCHAR=1"
			@ 08,00 SAY "UNKNOWNSASLONGVARCHAR=0"
			@ 09,00 SAY "TEXTASLONGVARCHAR=1"
			@ 10,00 SAY "USEDECLAREFETCH=0"
			@ 11,00 SAY "KSQO=1"
			@ 12,00 SAY "OPTIMIZER=1"
			@ 13,00 SAY "COMMLOG=0"
			@ 14,00 SAY "DEBUG=0"
			@ 15,00 SAY "MAXLONGVARCHARSIZE=8190"
			@ 16,00 SAY "MAXVARCHARSIZE=254"
			@ 17,00 SAY "UNKNOWNSIZES=0"
			@ 18,00 SAY "SOCKET=4096"
			@ 19,00 SAY "FETCH=100"
			@ 20,00 SAY "CONNSETTINGS="
			@ 21,00 SAY "SHOWSYSTEMTABLES=0"
			@ 22,00 SAY "ROWVERSIONING=0"
			@ 23,00 SAY "SHOWOIDCOLUMN=0"
			@ 24,00 SAY "FAKEOIDINDEX=0"
			@ 25,00 SAY "PROTOCOL=6.4"
			@ 26,00 SAY "READONLY=0"
			@ 27,00 SAY "PORT=5432"
			@ 28,00 SAY "SERVER=&conn_IP"
			@ 29,00 SAY "DATABASE=&conn_DB"
		 SET DEVI TO SCREEN

ENDPROC

*************************
PROCEDURE P_ImprimirLinks
*************************
PARAMETERS oRelatorioLinks, oRelatorioParameterFields, cRelatorinoNome
PRIVATE    oRelatorioLinks, oRelatorioParameterFields, cRelatorinoNome, ;
			  nReportObjectsLinksTotal

	nReportObjectsLinksTotal = oRelatorioLinks.Count

	IF nReportObjectsLinksTotal > 0 THEN

		CREATE CURSOR  CursorLinks (Texto MEMO)
		INSERT INTO CursorLinks (Texto) VALUES ("   Links: " + CHR(13) + CHR(10))

		FOR nReportObjectsLinksContador = 1 TO nReportObjectsLinksTotal
			INSERT INTO CursorLinks (Texto) VALUES ("      Link Name: " + ALLTRIM(oRelatorioReportObjects.Links.Item(nReportObjectsLinksContador).MainReportField.Name) + CHR(13) + CHR(10))
		ENDFOR

		INSERT INTO CursorLinks (Texto) VALUES ("      SubReport " + cRelatorinoNome + " Total Links: " + ALLTRIM(STR(nReportObjectsLinksTotal, 8, 0)) + " VS Parametros: " + ALLTRIM(STR(oRelatorioParameterFields.Count, 8, 0)))

		SELECT CursorLinks
		SCAN
			COPY MEMO CursorLinks.Texto TO &cArquivoGerado ADDITIVE
		ENDSCAN

	ENDIF
				
ENDPROC


*----------------------------------------------------------------------
* P_Rpt2RpaErro - substitui MESSAGEBOX no modo headless (automacao COM).
* Grava a mensagem no arquivo de status (PUBLIC gcRpt2RpaStatusFile,
* definido pelo Run-Rpt2Rpa-VFP9.vbs) e retorna sem bloquear a sessao.
*----------------------------------------------------------------------
PROCEDURE P_Rpt2RpaErro
PARAMETERS cMsg, nTipo, cTitulo
PRIVATE cMsg, nTipo, cTitulo, lnH

	IF TYPE("gcRpt2RpaStatusFile") == "C" AND NOT EMPTY(gcRpt2RpaStatusFile)
		lnH = IIF(FILE(gcRpt2RpaStatusFile), FOPEN(gcRpt2RpaStatusFile, 12), FCREATE(gcRpt2RpaStatusFile))
		IF lnH >= 0
			=FSEEK(lnH, 0, 2)
			=FPUTS(lnH, TRANSFORM(cMsg))
			=FCLOSE(lnH)
		ENDIF
	ENDIF

RETURN
