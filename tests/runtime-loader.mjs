// Test-only: typecheck original source imports, execute the current built Host JS.
import { registerHooks } from 'node:module'
const source = new URL('../src/', import.meta.url).href
const runtime = new URL('../lib/', import.meta.url).href
registerHooks({ resolve(specifier, context, nextResolve) {
 const resolved = nextResolve(specifier, context)
 if (resolved.url.startsWith(source) && !resolved.url.startsWith(source + 'client/') && resolved.url.endsWith('.ts')) {
   return nextResolve(runtime + resolved.url.slice(source.length, -3) + '.js', context)
 }
 return resolved
} })
