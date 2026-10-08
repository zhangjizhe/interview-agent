import { createRequire } from 'node:module';

// Resolve the actual DeepAgents dependency chain, rather than a test-only copy.
const sdkRequire = createRequire(require.resolve('deepagents'));
const matcherRequire = createRequire(sdkRequire.resolve('micromatch'));
const braces = matcherRequire('braces');
const glob = sdkRequire('fast-glob');

describe('bounded brace patterns in the installed dependency chain', () => {
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
  it('guards fast-glob task generation as used by the SDK', () => {
    expect(() => glob.generateTasks('{'.repeat(4900) + 'fixture' + '}'.repeat(4900))).toThrow(SyntaxError);
    expect(glob.generateTasks('{api,lab}/**/*.ts').map((task: any) => task.base)).toEqual(['api', 'lab']);
  });
});
