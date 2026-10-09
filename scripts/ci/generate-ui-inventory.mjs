import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(new URL('../../apps/agent-lab/package.json', import.meta.url));
const ts = require('typescript');
const inventoryPath = 'docs/acceptance/UI_INVENTORY.json';
const previous = JSON.parse(readFileSync(inventoryPath, 'utf8'));
if (previous.entries.some(entry => entry.verdict !== 'NOT_ACCEPTED' || entry.evidence !== null
  || ['productReview', 'apiPersistenceCheck', 'browserSecondCheck'].some(field => entry[field] !== 'PENDING'))) {
  throw new Error('Reviewed inventory must be reconciled explicitly; refusing to discard evidence');
}
// Explicit shipped surfaces from the current acceptance plan; no legacy screens.
const surfaces = [...new Set([...previous.entries.map(entry => entry.source), 'apps/agent-lab/src/AgentBuilderWorkspace.tsx'])];
const baseline = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const entries = [];
for (const source of surfaces) {
  const ast = ts.createSourceFile(source, readFileSync(source, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (ast.parseDiagnostics.length) throw new Error(`Cannot inventory invalid TSX: ${source}`);
  const routerLinks = new Set();
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === 'react-router-dom' && ts.isNamedImports(statement.importClause?.namedBindings)) {
      for (const item of statement.importClause.namedBindings.elements) if (['Link', 'NavLink'].includes((item.propertyName ?? item.name).text)) routerLinks.add(item.name.text);
    }
  }
  const visit = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      // Own components are enumerated at their implementation; Router links are
      // third-party controls, so retain their local call sites as interactions.
      if (/^[a-z]/.test(tag) || routerLinks.has(tag)) {
        let component = '(module)';
        for (let parent = node.parent; parent; parent = parent.parent) {
          if ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent)) && parent.name) { component = parent.name.text; break; }
          if ((ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) && ts.isVariableDeclaration(parent.parent)) { component = parent.parent.name.getText(ast); break; }
        }
        const position = ast.getLineAndCharacterOfPosition(node.getStart(ast));
        const attributes = node.attributes.getText(ast).replace(/\s+/g, ' ').trim();
        const element = ts.isJsxOpeningElement(node) ? node.parent : node;
        const kind = routerLinks.has(tag) || ['button', 'input', 'select', 'textarea', 'a', 'summary'].includes(tag)
          || node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && /^on(?:Click|Submit|Change|KeyDown|KeyUp|Blur|Focus)$/.test(attribute.name.getText(ast))) ? 'interaction' : 'display';
        entries.push({ id: `UI-${String(entries.length + 1).padStart(4, '0')}`, area: source.includes('agent-lab') ? 'Lab' : 'Interview',
          source, line: position.line + 1, component, kind, tag,
          labelOrExpression: element.getText(ast).replace(/\s+/g, ' ').trim().slice(0, 700), attributes,
          productReview: 'PENDING', apiPersistenceCheck: 'PENDING', browserSecondCheck: 'PENDING', evidence: null, verdict: 'NOT_ACCEPTED' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
const archiveDir = 'docs/project/archive/ui-inventory';
mkdirSync(archiveDir, { recursive: true });
const archivePath = previous.baseline === baseline && previous.previousInventory
  ? previous.previousInventory : `${archiveDir}/${previous.baseline}.json`;
if (!existsSync(archivePath)) writeFileSync(archivePath, `${JSON.stringify(previous, null, 2)}\n`);
const inventory = { schemaVersion: 2, baseline, generatedFrom: 'Explicit shipped TSX surfaces via TypeScript AST; not browser evidence',
  previousBaseline: previous.baseline === baseline ? previous.previousBaseline : previous.baseline, previousInventory: archivePath,
  limitations: ['Every entry remains NOT_ACCEPTED until independent API/persistence and browser evidence are reconciled.',
    'Dynamic/conditional/responsive states require runtime enumeration; wrapper labels overlap.',
    'Only explicitly selected current surface files are scanned; component reachability inside each file still requires browser confirmation.'], entries };
writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify({ baseline, templates: entries.length, interactions: entries.filter(entry => entry.kind === 'interaction').length, displays: entries.filter(entry => entry.kind === 'display').length, sources: surfaces.length }));
