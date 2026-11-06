import ts from 'typescript'
import { build } from 'tsdown'
import { rmSync, cpSync, globSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// Only this package's generated runtime directory is owned by this build.
rmSync('lib', { recursive: true, force: true })
await build({
  entry: ["src/**/*.ts", "!src/client/**"],
  // Rolldown preserves TC39 decorators; Node needs the same standard transform
  // previously supplied by tsc for this Remote controller.
  plugins: [{ name: 'remote-standard-decorators', transform(code, id) {
    if (!id.endsWith('/src/controller.ts')) return
    const result = ts.transpileModule(code, { fileName: id, compilerOptions: {
      target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext,
      sourceMap: true, inlineSources: true, rewriteRelativeImportExtensions: true,
    } })
    return { code: result.outputText, map: result.sourceMapText }
  } }], outDir: 'lib', root: 'src', unbundle: true,
  platform: 'node', format: 'esm', outExtensions: () => ({ js: '.js' }), target: 'node22', sourcemap: true,
  clean: false, dts: false, deps: { neverBundle: [/.*/] },
})
await build({
 entry: ["src/client/index.tsx"], outDir: 'lib', platform: 'browser', format: 'cjs',
 target: 'es2022', sourcemap: true, clean: false, dts: false,
 deps: { neverBundle: ["react", "react/jsx-runtime", "@deepseek-ai/dsh-client-ui-primitives", "react-dom", "react-dom/client", "@deepseek-ai/cordis", "@deepseek-ai/dsh-client-store", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-ui-dockkit"] },
 outputOptions: {
   entryFileNames: 'client.js',
   banner: 'window.__ModuleLoader__.load({ id: \"dsh-plugin-chatgpt\", factory: (require) => {',
   intro: 'var module = { exports: {} }; var exports = module.exports;',
   footer: 'return module.exports; } });',
 },
})
execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.build.json', '--emitDeclarationOnly'], { stdio: 'inherit' })

for (const file of globSync('src/**/*.json')) cpSync(file, file.replace(/^src\//, 'lib/'))
