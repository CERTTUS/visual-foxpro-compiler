import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Compilação de projetos VB.NET via MSBuild, espelhando o `MsbuildCompiler.ps1` do
 * `vfp-compiler-installer`.
 *
 * O ERP não é só VFP: parte dele são bibliotecas .NET que acompanham os fontes FoxPro no
 * mesmo repositório. Ao alterar um `.vb` (ou um `.resx`, `.vbproj`, `.settings`…), a DLL
 * precisa ser regerada — do contrário o VFP continua chamando a versão antiga via COM.
 *
 * Diferente da pipeline, aqui **não** há versionamento automático: a DLL sai com a versão
 * declarada no `AssemblyInfo` do próprio projeto, como o desenvolvedor a definiu.
 */

/** Extensões que disparam a recompilação do projeto .NET que as contém. */
export const DOTNET_SOURCE_EXTENSIONS = [
    '.vb',
    '.vbproj',
    '.sln',
    '.resx',
    '.settings',
    '.snk',
    '.manifest',
    '.myapp',
    '.config',
];

/** Indica se o arquivo pertence ao mundo .NET tratado aqui. */
export function isDotNetSource(filePath: string): boolean {
    return DOTNET_SOURCE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

/**
 * Caminhos padrão do MSBuild, na ordem da referência: o legado do .NET Framework
 * primeiro, porque os projetos alvo são .NET 3.5/4.x e o MSBuild do Roslyn chega a
 * estourar a pilha em arquivos `.vb` muito grandes.
 */
const MSBUILD_CANDIDATES = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\MSBuild.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\MSBuild.exe',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\MSBuild\\Current\\Bin\\MSBuild.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\MSBuild\\Current\\Bin\\MSBuild.exe',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe',
];

/** Localiza o MSBuild: o configurado, se válido; senão o primeiro caminho padrão existente. */
export function resolveMsbuild(configured?: string): string | undefined {
    if (configured && fs.existsSync(configured)) {
        return configured;
    }
    return MSBUILD_CANDIDATES.find((p) => fs.existsSync(p));
}

/**
 * Projeto `.vbproj` dono de um arquivo: sobe a árvore a partir da pasta do arquivo até a
 * raiz do repositório e devolve o `.vbproj` **mais profundo** que o contém.
 *
 * Preferir o mais profundo importa: no repositório do ERP há `.sln`/`.vbproj` duplicados
 * em vários níveis, e o de nível mais alto costuma apontar para um projeto órfão, sem o
 * `My Project/Resources.resx` — o build falha com MSB3552.
 */
export function findOwningProject(filePath: string, rootDir: string): string | undefined {
    if (path.extname(filePath).toLowerCase() === '.vbproj') {
        return filePath;
    }
    const root = path.resolve(rootDir);
    let dir = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
        ? path.resolve(filePath)
        : path.dirname(path.resolve(filePath));

    while (dir.length >= root.length) {
        try {
            const achado = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.vbproj'));
            if (achado) {
                return path.join(dir, achado);
            }
        } catch {
            /* pasta inacessível */
        }
        const pai = path.dirname(dir);
        if (pai === dir) {
            break;
        }
        dir = pai;
    }
    return undefined;
}

/** Projetos `.vbproj` distintos que cobrem os arquivos informados. */
export function projectsForSources(sources: string[], rootDir: string): string[] {
    const projetos = new Set<string>();
    for (const src of sources) {
        const proj = findOwningProject(src, rootDir);
        if (proj) {
            projetos.add(path.resolve(proj));
        }
    }
    return [...projetos];
}

export interface MsbuildOptions {
    msbuildPath?: string;
    /** `Release` (padrão) ou `Debug`. */
    configuration: string;
    timeoutMs: number;
    log: (message: string) => void;
}

export interface MsbuildResult {
    success: boolean;
    project: string;
    message?: string;
}

/**
 * Compila um `.vbproj` com o MSBuild. Os parâmetros repetem os da referência: plataforma
 * fixa, sem registro COM e sem assemblies de serialização — o que a pipeline usa para
 * produzir a mesma DLL que vai ao cliente.
 */
export function buildDotNetProject(
    vbprojPath: string,
    options: MsbuildOptions
): Promise<MsbuildResult> {
    const msbuild = resolveMsbuild(options.msbuildPath);
    if (!msbuild) {
        return Promise.resolve({
            success: false,
            project: vbprojPath,
            message:
                'MSBuild não encontrado. Instale o Visual Studio Build Tools ou informe o caminho em visualFoxproCompiler.msbuildPath.',
        });
    }

    const args = [
        vbprojPath,
        `/p:Configuration=${options.configuration}`,
        '/p:Platform=AnyCPU',
        '/p:RegisterForComInterop=false',
        '/p:GenerateSerializationAssemblies=Off',
        '/m',
        '/v:minimal',
        '/nologo',
    ];

    return new Promise((resolve) => {
        execFile(
            msbuild,
            args,
            {
                cwd: path.dirname(vbprojPath),
                windowsHide: true,
                timeout: options.timeoutMs,
                maxBuffer: 16 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                const saida = String(stdout || '').trim();
                if (saida) {
                    for (const line of saida.split(/\r?\n/).slice(-20)) {
                        if (line.trim()) {
                            options.log(`  ${line.trim()}`);
                        }
                    }
                }
                if (error) {
                    // O MSBuild detalha o erro no stdout; o stderr costuma vir vazio.
                    const detalhe = saida
                        .split(/\r?\n/)
                        .filter((l) => /error|erro/i.test(l))
                        .slice(0, 5)
                        .join(' | ');
                    resolve({
                        success: false,
                        project: vbprojPath,
                        message: detalhe || String(stderr || '').trim() || error.message,
                    });
                    return;
                }
                resolve({ success: true, project: vbprojPath });
            }
        );
    });
}
