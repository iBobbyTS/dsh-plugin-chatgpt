/**
 * Verify the replay contract against an actual DSH checkout's BlockAssembler.
 * Usage: npm run verify:harness -- /path/to/deepseek-harness
 * Bundles only the real assembler and its value helpers; never launches a
 * profile, loads credentials, contacts a provider, or modifies the checkout.
 */
import { build } from 'esbuild'
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const checkout = process.argv[2]
if (!checkout) throw new Error('Pass the path to the DSH source checkout to verify.')
const dsh = resolve(checkout)
const plugin = fileURLToPath(new URL('../', import.meta.url))
const assembler = join(dsh, 'packages/llm/llm/src/assembler.ts')
await access(assembler)
const directory = await mkdtemp(join(tmpdir(), 'chatgpt-harness-contract-'))
try {
  const source = `
    import assert from 'node:assert/strict';
    import { BlockAssembler } from ${JSON.stringify(assembler)};
    import { BlockTranslator } from ${JSON.stringify(join(plugin, 'src/convert/blocks.ts'))};
    import { decodeEvent } from ${JSON.stringify(join(plugin, 'src/api/events.ts'))};
    import { requestOf } from ${JSON.stringify(join(plugin, 'src/convert/harness.ts'))};
    import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
    import { ChatGptAdapter, toNeutralRequest } from ${JSON.stringify(join(plugin, 'src/adapter.ts'))};
    import { toResponsesBody } from ${JSON.stringify(join(plugin, 'src/convert/request.ts'))};
    import { streamCases } from ${JSON.stringify(join(plugin, 'tests/fixtures/stream-cases.ts'))};
    const policy = resolveRetryPolicy(undefined);
    assert.equal(policy.mode, 'normal');
    const originalFetch = globalThis.fetch;
    try {
      for (const body of ['', 'data: {"type":"response.output_text.delta","delta":"partial"}\\n\\n']) {
        globalThis.fetch = async () => new Response(body);
        const auth = { active: () => ({ accessToken: 'synthetic' }), usable: async () => ({ accessToken: 'synthetic' }) };
        let observedChunks = 0;
        await assert.rejects(async () => {
          for await (const chunk of new ChatGptAdapter({ auth }).stream('chatgpt', { provider: 'chatgpt', model: 'm', messages: [] })) { observedChunks++; }
        }, error => error.code === 'TRANSPORT' && policy.retryableCodes.includes(error.code) && error.cause.code === 'stream_ended_early');
        if (body) assert.ok(observedChunks > 0, 'partial EOF must actually emit output before failure');
      }
      assert.equal(policy.retryableCodes.includes('invalid_request_error'), false);
    } finally { globalThis.fetch = originalFetch; }
    const context = { provider: 'chatgpt', model: 'gpt-6.1-sol', scope: 'test-account' };
    const output = [
      { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque' },
      { type: 'message', id: 'msg_1', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'Checking.', annotations: [] }] },
      { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'read_file', arguments: '{ "path": "a" }' },
    ];
    const event = decodeEvent(JSON.stringify({ type: 'response.completed', response: { output } }));
    const chunks = new BlockTranslator(context).push(event);
    const assembled = new BlockAssembler();
    for (const chunk of chunks) assembled.push(chunk);
    assert.deepEqual(assembled.finish, { kind: 'tool-calls' });
    assert.ok(assembled.replayState);
    const saved = JSON.parse(JSON.stringify(assembled.message({
      provider: context.provider, model: context.model, replayState: assembled.replayState,
    })));
    const options = { provider: context.provider, model: context.model, sessionId: 's1', messages: [saved] };
    const body = toResponsesBody(toNeutralRequest(requestOf(options), context.scope));
    assert.deepEqual(body.input, output);
    assert.equal(assembled.blocks()[0].text, '');
    // DSH prunes unsafe tool calls on max-tokens. Native metadata must not
    // resurrect that call, even though the remaining block fingerprints match.
    const truncated = new BlockAssembler();
    for (const chunk of chunks) truncated.push(chunk.type === 'finish' ? { ...chunk, reason: { kind: 'max-tokens' } } : chunk);
    const pruned = truncated.message({ provider: context.provider, model: context.model, replayState: truncated.replayState });
    const fallback = toResponsesBody(toNeutralRequest(requestOf({ ...options, messages: [pruned] }), context.scope));
    assert.ok(fallback.input.every(item => item.type !== 'function_call' && item.type !== 'reasoning'));
    assert.equal(fallback.input[0].content[0].text, 'Checking.');
    for (const fixture of streamCases) {
      const streamTranslator = new BlockTranslator(context);
      const actualHost = new BlockAssembler();
      for (const payload of fixture.events) {
        const decoded = decodeEvent(JSON.stringify(payload));
        if (decoded) for (const chunk of streamTranslator.push(decoded)) actualHost.push(chunk);
      }
      assert.deepEqual(actualHost.blocks(), fixture.blocks, fixture.name);
      // Reasoning alone is not an actionable answer: the translator correctly
      // reports EMPTY_RESPONSE even when the native reasoning has valid identity.
      const actionable = fixture.blocks.some(block => block.type !== 'reasoning');
      if (actionable) assert.notEqual(actualHost.finish.kind, 'error', fixture.name);
      else {
        assert.equal(actualHost.finish.kind, 'error', fixture.name);
        assert.equal(actualHost.finish.failure.code, 'EMPTY_RESPONSE', fixture.name);
      }
      // The translator withholds replay metadata from EMPTY_RESPONSE finishes.
      const retainedReplay = fixture.replay && actionable;
      assert.equal(actualHost.replayState !== undefined, retainedReplay, fixture.name);
      const durable = JSON.parse(JSON.stringify(actualHost.message({
        provider: context.provider, model: context.model, replayState: actualHost.replayState,
      })));
      const serialized = toResponsesBody(toNeutralRequest(requestOf({ ...options, messages: [durable] }), context.scope));
      const hasModelInput = retainedReplay || actionable;
      assert.equal(serialized.input.length > 0, hasModelInput, fixture.name);
    }
    console.log('PASS: real DSH assembly, JSON restore, pruning, and ' + streamCases.length + ' malformed/partial stream fixtures');
  `
  const result = await build({
    stdin: { contents: source, resolveDir: plugin, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false,
    // Keep the installed peer in its package directory: its bundled attribution
    // resolves ../package.json via createRequire(import.meta.url). Relocating
    // that module to this temporary bundle breaks its real metadata lookup.
    // The BlockAssembler under test above still comes from the requested checkout.
    plugins: [{ name: 'installed-llm-peer', setup(builder) {
      builder.onResolve({ filter: /^@deepseek-ai\/dsh-llm$/ }, () => ({
        path: createRequire(import.meta.url).resolve('@deepseek-ai/dsh-llm'), external: true,
      }))
    } }],
    alias: {
      '@deepseek-ai/dsh-brand': join(dsh, 'packages/util/brand/src/index.ts'),
      '@deepseek-ai/dsh-util-values': join(dsh, 'packages/util/values/src/index.ts'),
      '@deepseek-ai/dsh-util-crypto': join(dsh, 'packages/util/crypto/src/index.ts'),
    },
  })
  const entry = join(directory, 'verify.mjs')
  await writeFile(entry, result.outputFiles[0].contents)
  execFileSync(process.execPath, [entry], { stdio: 'inherit' })
} finally {
  await rm(directory, { recursive: true, force: true })
}
