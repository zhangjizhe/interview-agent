import { createRequire } from 'node:module';

// Resolve the actual DeepAgents dependency chain, rather than a test-only copy.
const sdkRequire = createRequire(require.resolve('deepagents'));
const matcherRequire = createRequire(sdkRequire.resolve('micromatch'));
const braces = matcherRequire('braces');
const glob = sdkRequire('fast-glob');

describe('bounded brace patterns in the installed dependency chain', () => {
  it.each(['compile', 'expand', 'stringify'])('%s rejects deep and cyclic AST input, including direct library imports', method => {
    const deep: any = { type: 'root', nodes: [] };
    let parent = deep;
    for (let i = 0; i < 1000; i++) {
      const child = { type: 'paren', nodes: [], parent };
      parent.nodes.push(child);
      parent = child;
    }
    parent.nodes.push({ type: 'text', value: 'fixture' });
    const cyclic: any = { type: 'root', nodes: [] };
    cyclic.nodes.push(cyclic);
    const direct = matcherRequire(`braces/lib/${method}`);
    for (const run of [braces[method], direct]) {
      expect(() => run(deep)).toThrow(SyntaxError);
      expect(() => run(cyclic)).toThrow(SyntaxError);
      expect(() => run(braces.parse('{api,lab}/*.ts'))).not.toThrow();
    }
  });
  it.each(['parse', 'compile', 'expand', 'stringify'])('%s rejects deep nested input before recursive walkers', method => {
    for (const delimiter of ['{', '(']) {
      const pattern = delimiter.repeat(4900) + 'fixture' + (delimiter === '{' ? '}' : ')').repeat(4900);
      expect(() => braces[method](pattern)).toThrow(SyntaxError);
      expect(() => braces[method](pattern)).toThrow('maximum nesting depth (32)');
    }
  });
  it('keeps normal and bounded nested patterns usable', () => {
    expect(braces.expand('{frontend,{api,lab}}/**/*.ts')).toEqual(['frontend/**/*.ts', 'api/**/*.ts', 'lab/**/*.ts']);
    expect(() => braces.compile('{'.repeat(32) + 'fixture' + '}'.repeat(32))).not.toThrow();
    expect(braces.expand('fixture/\\{literal\\}.ts')).toEqual(['fixture/{literal}.ts']);
  });
  it('rejects excessive AST width and malformed parent cycles without hanging', () => {
    const wide = { type: 'root', nodes: Array(20001).fill({ type: 'text', value: 'fixture' }) };
    for (const method of ['compile', 'expand', 'stringify']) expect(() => braces[method](wide)).toThrow(SyntaxError);
    const cyclicParent: any = { type: 'paren', nodes: [{ type: 'text', value: 'fixture' }] };
    cyclicParent.parent = cyclicParent;
    expect(() => braces.expand(cyclicParent)).toThrow(SyntaxError);
    // Shared nodes in an acyclic AST are allowed, as are ordinary parser parent backlinks.
    const shared = { type: 'text', value: 'fixture' };
    expect(braces.stringify({ type: 'root', nodes: [shared, shared] })).toBe('fixturefixture');
  });
  it('guards fast-glob task generation as used by the SDK', () => {
    expect(() => glob.generateTasks('{'.repeat(4900) + 'fixture' + '}'.repeat(4900))).toThrow(SyntaxError);
    expect(glob.generateTasks('{api,lab}/**/*.ts').map((task: any) => task.base)).toEqual(['api', 'lab']);
  });
});
