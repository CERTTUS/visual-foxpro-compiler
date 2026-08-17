import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Pausa/retomada das compilações em lote ("Compilar todo o repositório" e
 * "Compilar arquivos alterados (git)").
 *
 * A notificação de progresso do VS Code não aceita botões customizados — só o
 * "Cancelar" nativo. Por isso o Pausar/Retomar vive num item da barra de status,
 * visível apenas enquanto a compilação está em andamento.
 *
 * A pausa atua em dois níveis:
 *  - no lado da extensão (loops PR2/SQ2/RPT e entre pastas), via `waitWhilePaused`;
 *  - dentro da sessão única do VFP9 (FoxBin2Prg), via `pauseFile`: enquanto esse
 *    arquivo existir, o `Run-Bin2PrgList-VFP9.vbs` aguarda antes do próximo item da
 *    lista. Sem isso o botão seria inócuo no build completo, em que a maior parte do
 *    tempo é gasta dentro dessa sessão.
 */

/** Comando que alterna pausa/retomada (registrado uma vez, na ativação). */
export const TOGGLE_PAUSE_COMMAND = 'visualFoxproCompiler.togglePause';

/** Context key que controla a visibilidade do comando na paleta. */
const BUILDING_CONTEXT = 'visualFoxproCompiler.building';

/** Controlador da compilação em andamento (só existe um build por vez). */
let active: PauseController | undefined;

/**
 * Registra o comando de pausa/retomada. O comando age sobre o build em andamento;
 * sem build ativo, avisa o usuário e não faz nada.
 */
export function registerPauseCommand(): vscode.Disposable {
    return vscode.commands.registerCommand(TOGGLE_PAUSE_COMMAND, () => {
        if (!active) {
            vscode.window.setStatusBarMessage('Nenhuma compilação em andamento.', 3000);
            return;
        }
        active.toggle();
    });
}

export class PauseController implements vscode.Disposable {
    private _paused = false;
    private _disposed = false;
    /** Continuações aguardando o retorno da execução (liberadas em `resume`). */
    private waiters: Array<() => void> = [];
    private readonly item: vscode.StatusBarItem;
    private done = 0;
    private total = 0;

    /** Arquivo-flag observado pelo motor VBS: enquanto existir, o VFP9 aguarda. */
    readonly pauseFile: string;

    constructor(total: number) {
        this.total = total;
        this.pauseFile = path.join(os.tmpdir(), `vfc_pause_${process.pid}_${Date.now()}.flag`);
        this.removePauseFile(); // higiene: nunca começar pausado

        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        this.item.command = TOGGLE_PAUSE_COMMAND;
        this.render();
        this.item.show();

        active = this;
        vscode.commands.executeCommand('setContext', BUILDING_CONTEXT, true);
    }

    get paused(): boolean {
        return this._paused;
    }

    /** Atualiza o contador exibido na barra de status. */
    setProgress(done: number, total: number, _currentName?: string): void {
        this.done = done;
        this.total = total;
        this.render();
    }

    pause(): void {
        if (this._paused || this._disposed) {
            return;
        }
        this._paused = true;
        try {
            fs.writeFileSync(this.pauseFile, 'paused');
        } catch {
            /* sem o arquivo-flag a pausa vale só do lado da extensão */
        }
        this.render();
        vscode.window.setStatusBarMessage('Compilação pausada — retome na barra de status.', 5000);
    }

    resume(): void {
        if (!this._paused) {
            return;
        }
        this._paused = false;
        this.removePauseFile();
        const pending = this.waiters;
        this.waiters = [];
        for (const release of pending) {
            release();
        }
        this.render();
    }

    toggle(): void {
        if (this._paused) {
            this.resume();
        } else {
            this.pause();
        }
    }

    /**
     * Aguarda enquanto estiver pausado. Retorna imediatamente se não houver pausa e
     * também quando o build é cancelado (o cancelamento tem precedência sobre a pausa).
     */
    async waitWhilePaused(token: vscode.CancellationToken): Promise<void> {
        while (this._paused && !this._disposed && !token.isCancellationRequested) {
            await new Promise<void>((resolve) => {
                let released = false;
                const release = () => {
                    if (released) {
                        return;
                    }
                    released = true;
                    sub.dispose();
                    resolve();
                };
                const sub = token.onCancellationRequested(release);
                this.waiters.push(release);
            });
        }
    }

    dispose(): void {
        this._disposed = true;
        this._paused = false;
        this.removePauseFile();
        const pending = this.waiters;
        this.waiters = [];
        for (const release of pending) {
            release();
        }
        this.item.dispose();
        if (active === this) {
            active = undefined;
            vscode.commands.executeCommand('setContext', BUILDING_CONTEXT, false);
        }
    }

    /** Remove o arquivo-flag, destravando a sessão do VFP9. */
    private removePauseFile(): void {
        try {
            fs.unlinkSync(this.pauseFile);
        } catch {
            /* já não existe */
        }
    }

    private render(): void {
        const counter = this.total > 0 ? ` ${this.done}/${this.total}` : '';
        if (this._paused) {
            this.item.text = `$(debug-continue) Retomar VFP${counter}`;
            this.item.tooltip =
                'Compilação Visual FoxPro PAUSADA — clique para retomar. Para abortar, use o Cancelar da notificação de progresso.';
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.item.text = `$(debug-pause) Pausar VFP${counter}`;
            this.item.tooltip =
                'Compilação Visual FoxPro em andamento — clique para pausar. Para abortar, use o Cancelar da notificação de progresso.';
            this.item.backgroundColor = undefined;
        }
    }
}
