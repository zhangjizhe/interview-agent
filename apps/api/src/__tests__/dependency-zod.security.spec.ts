import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Resolve the installed consumers, rather than a test-only replacement package.
const api = createRequire(resolve(__dirname, '../../package.json'));
const mcp = createRequire(api.resolve('@modelcontextprotocol/sdk/types.js'));
const deep = createRequire(api.resolve('deepagents'));
const core = createRequire(api.resolve('@langchain/core/package.json'));
const openai = createRequire(api.resolve('openai'));
const variants = [
  { name: 'API zod3 root', boundedMap: false, z: api('zod'), path: api.resolve('zod') },
  { name: 'API zod/v3 compatibility', boundedMap: false, z: api('zod/v3'), path: api.resolve('zod/v3') },
  { name: 'actual MCP zod/v4', boundedMap: Number(mcp('zod/package.json').version.split('.')[0]) >= 4, z: mcp('zod/v4'), path: mcp.resolve('zod/v4') },
  { name: 'actual DeepAgents zod4', boundedMap: true, z: deep('zod'), path: deep.resolve('zod') },
];

describe.each(variants)('$name installed collection resource boundary', ({ z, path, boundedMap }) => {
  it('resolves an actual package and supports ordinary nested union/transform schemas', () => {
    expect(path).toContain('/node_modules/');
    const schema = z.object({ values: z.array(z.union([z.string(), z.number()])).max(2), label: z.string().transform((s: string) => s.toUpperCase()) });
    expect(schema.parse({ values: ['a', 1], label: 'ok' })).toEqual({ values: ['a', 1], label: 'OK' });
    expect(schema.safeParse({ values: [false], label: 'ok' }).success).toBe(false);
  });
  const caps = ['array/max', 'array/length', 'set/max', 'set/size'];
  // Zod3 (including its bundled older v4) has no bounded Map API. Do not invent a .max() shim and mistake a
  // TypeError for a resource rejection, nor claim its unbounded maps are fixed.
  if (boundedMap) caps.push('map/max', 'map/size');
  else it('does not falsely advertise a native bounded Map API', () => {
    expect(z.map(z.string(), z.string()).max).toBeUndefined();
    expect(z.map(z.string(), z.string()).size).toBeUndefined();
  });
  it.each(caps.flatMap(cap => ['sync', 'async'].flatMap(mode => ['invalid', 'refine'].map(input => [cap, mode, input]))))('%s %s rejects oversized %s before visiting elements', async (cap, mode, kind) => {
    let visits = 0; let refinements = 0;
    const element = z.preprocess((value: unknown) => { visits++; return value; }, z.string().refine(() => { refinements++; return true; }));
    const [container, method] = cap.split('/');
    const base = container === 'array' ? z.array(element) : container === 'set' ? z.set(element) : z.map(element, element);
    const schema = z.object({ collection: base[method](2) });
    const values = kind === 'invalid' ? [11, 12, 13] : ['a', 'b', 'c'];
    const value = container === 'array' ? values : container === 'set' ? new Set(values) : new Map(values.map(v => [v, v]));
    const result = mode === 'async' ? await schema.safeParseAsync({ collection: value }) : schema.safeParse({ collection: value });
    expect(result.success).toBe(false);
    expect(visits).toBe(0); expect(refinements).toBe(0);
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0].code).toBe('too_big');
    expect(result.error.issues[0].path).toEqual(['collection']);
  });
  it.each(['sync', 'async'])('preserves custom size errors and skips outer refinements on oversized input: %s', async mode => {
    let elements = 0; let outer = 0;
    const schema = z.array(z.string().refine(() => { elements++; return true; })).max(1, 'synthetic size bound').refine(() => { outer++; return true; });
    const result = mode === 'async' ? await schema.safeParseAsync(['a', 'b']) : schema.safeParse(['a', 'b']);
    expect(result.success).toBe(false); expect(elements).toBe(0); expect(outer).toBe(0);
    expect(result.error.issues).toHaveLength(1); expect(result.error.issues[0].message).toBe('synthetic size bound');
  });
  it('checks raw set cardinality before element transforms can collapse distinct entries', () => {
    let transformed = 0;
    const schema = z.set(z.string().transform((value: string) => { transformed++; return value.toUpperCase(); })).max(1, 'raw set bound');
    const result = schema.safeParse(new Set(['a', 'A']));
    expect(result.success).toBe(false); expect(transformed).toBe(0);
    expect(result.error.issues).toHaveLength(1); expect(result.error.issues[0].code).toBe('too_big');
    expect(result.error.issues[0].message).toBe('raw set bound');
  });
  it('preserves valid container transforms and an alternate union branch', () => {
    expect(z.array(z.string()).max(2).transform((values: string[]) => values.slice(0, 1)).parse(['a', 'b'])).toEqual(['a']);
    const alternatives = z.union([z.array(z.number()).max(1), z.array(z.string()).max(2)]).transform((values: unknown[]) => values.join('/'));
    expect(alternatives.parse(['a', 'b'])).toBe('a/b');
  });
  if (z.array(z.string())._zod) {
    it('preserves a custom check before the size cap instead of hoisting the cap over it', () => {
      let checked = 0;
      const schema = z.array(z.string()).refine(() => { checked++; return true; }).max(1, 'after custom');
      const result = schema.safeParse(['a', 'b']);
      expect(result.success).toBe(false); expect(checked).toBe(1); expect(result.error.issues[0].message).toBe('after custom');
    });
    it('preserves overwrite-before-max and rejects max-before-overwrite without running it', () => {
      let rewritten = 0;
      const shrink = (values: string[]) => { rewritten++; return values.slice(0, 1); };
      expect(z.array(z.string()).overwrite(shrink).max(1).parse(['a', 'b'])).toEqual(['a']);
      expect(rewritten).toBe(1); rewritten = 0;
      expect(z.array(z.string()).max(1).overwrite(shrink).safeParse(['a', 'b']).success).toBe(false);
      expect(rewritten).toBe(0);
    });
  }
  it('the actual ESM export also enforces the collection resource boundary', () => {
    const code = `
      import {pathToFileURL} from 'node:url';
      const z = await import(pathToFileURL(process.argv[1].replace(/\\.cjs$/, '.js')).href);
      let visited = 0;
      const item = z.preprocess(v => { visited++; return v; }, z.string());
      for (const [schema, input] of [[z.array(item).max(1), [1,2]], [z.set(item).max(1), new Set([1,2])]]) {
        const result = await schema.safeParseAsync(input);
        if (result.success || visited !== 0 || result.error.issues.length !== 1) throw new Error('ESM resource bound failed');
      }
      console.log(JSON.stringify({visited}));
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code, path], { encoding: 'utf8', timeout: 5000, maxBuffer: 16384 });
    expect({ status: child.status, error: child.error?.message, stderr: child.stderr }).toEqual({ status: 0, error: undefined, stderr: '' });
    expect(JSON.parse(child.stdout)).toEqual({ visited: 0 });
  });
  it.each(caps)('%s preserves valid exact boundary and transform output', async cap => {
    const [container, method] = cap.split('/');
    const item = z.string().transform((value: string) => value.toUpperCase());
    const base = container === 'array' ? z.array(item) : container === 'set' ? z.set(item) : z.map(z.string(), item);
    const schema = base[method](2);
    const input = container === 'array' ? ['a', 'b'] : container === 'set' ? new Set(['a', 'b']) : new Map([['k1', 'a'], ['k2', 'b']]);
    const expected = container === 'array' ? ['A', 'B'] : container === 'set' ? new Set(['A', 'B']) : new Map([['k1', 'A'], ['k2', 'B']]);
    expect(schema.parse(input)).toEqual(expected); expect(await schema.parseAsync(input)).toEqual(expected);
  });
});

describe('bundled v4 internal context compatibility', () => {
  const bundled = api('zod/v4');
  it.each([{ skipChecks: true }, { direction: 'backward' }])('falls back to original run for context %j', flags => {
    let visited = 0;
    const schema = bundled.array(bundled.string().refine(() => { visited++; return true; })).max(1);
    const payload = schema._zod.run({ value: ['a', 'b'], issues: [] }, { async: false, ...flags });
    expect(visited).toBe(2); expect(payload.issues.map((issue: any) => issue.code)).toEqual(['too_big']);
  });
});

describe('installed SDK schema compatibility after resource patch', () => {
  it('parses actual MCP initialization and call-tool messages and rejects malformed protocol fields', () => {
    const types = api('@modelcontextprotocol/sdk/types.js');
    const initialize = { method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'synthetic-zod-fixture', version: '1' } } };
    expect(types.InitializeRequestSchema.parse(initialize)).toEqual(initialize);
    expect(types.InitializeRequestSchema.safeParse({ ...initialize, params: { ...initialize.params, protocolVersion: 42 } }).success).toBe(false);
    const tool = { method: 'tools/call', params: { name: 'synthetic_echo', arguments: { text: 'bounded' } } };
    expect(types.CallToolRequestSchema.parse(tool)).toEqual(tool);
    expect(types.CallToolRequestSchema.safeParse({ method: 'tools/call', params: { name: 42 } }).success).toBe(false);
  });
  it('converts real LangChain zod3 and zod4 schemas retaining bounds/required fields', () => {
    const { toJsonSchema } = api('@langchain/core/utils/json_schema');
    for (const z of [core('zod/v3'), core('zod/v4')]) {
      const schema = z.object({ label: z.string(), values: z.array(z.string()).max(2) });
      const converted = toJsonSchema(schema);
      expect(converted.type).toBe('object'); expect(converted.required).toEqual(expect.arrayContaining(['label', 'values']));
      expect(converted.properties.label.type).toBe('string'); expect(converted.properties.values.maxItems).toBe(2);
      expect(converted.properties.values.items.type).toBe('string');
    }
  });
  it('converts the installed OpenAI zod3 response schema and actually parses valid/invalid content', () => {
    const { zodResponseFormat } = openai('openai/helpers/zod');
    const z = openai('zod/v3');
    const format = zodResponseFormat(z.object({ label: z.string(), values: z.array(z.string()).max(2) }), 'synthetic_response');
    expect(format.type).toBe('json_schema'); expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.schema.properties.values.maxItems).toBe(2);
    expect(format.$parseRaw(JSON.stringify({ label: 'ok', values: ['a'] }))).toEqual({ label: 'ok', values: ['a'] });
    expect(() => format.$parseRaw(JSON.stringify({ label: 42, values: ['a'] }))).toThrow();
  });
});
