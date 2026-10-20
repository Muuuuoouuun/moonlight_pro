import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

// Source contracts only: no browser, React rendering, provider requests, or env reads.
// Resolve the imported component, not its local spelling: a different library's
// IconButton is not ours, and `Button as IconButton` still has Button's contract.
const HUB_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ICON_MODULE = path.join(HUB_ROOT, 'components/hub/hub-icons');
const PRIMITIVE_MODULE = path.join(HUB_ROOT, 'components/hub/hub-primitives');
const TEST_SOURCE = path.join(HUB_ROOT, 'components/hub/icon-guard-example.jsx');

function parse(file, source) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') || file.endsWith('.ts') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null;
}

function readRegistry(source) {
  const parsed = parse(`${ICON_MODULE}.jsx`, source);
  assert.equal(parsed.parseDiagnostics.length, 0, 'Icon registry must parse');
  const objects = new Map();
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer &&
          ts.isObjectLiteralExpression(declaration.initializer)) {
        objects.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  const icons = objects.get('I');
  assert.ok(icons, 'Expected the actual I registry object, not a comment or string');
  const names = new Set();
  for (const entry of icons.properties) {
    assert.ok(ts.isPropertyAssignment(entry), 'Registry entries must be explicit properties');
    const name = propertyName(entry.name);
    assert.ok(name, 'Registry entries need a static name');
    assert.ok(!names.has(name), `Duplicate icon key: ${name}`);
    names.add(name);
  }
  assert.ok(names.size > 0, 'Icon registry must not be empty');
  const aliases = objects.get('ICON_ALIASES');
  const aliasNames = new Set();
  for (const entry of aliases?.properties || []) {
    assert.ok(ts.isPropertyAssignment(entry) && ts.isStringLiteral(entry.initializer),
      'Icon aliases must have explicit string targets');
    const name = propertyName(entry.name);
    assert.ok(name && !names.has(name) && !aliasNames.has(name), `Duplicate icon alias: ${name}`);
    // Iconed performs one lookup, so alias-to-alias chains must not appear valid.
    assert.ok(names.has(entry.initializer.text),
      `Icon alias ${name} targets missing glyph ${entry.initializer.text}`);
    aliasNames.add(name);
  }
  return new Set([...names, ...aliasNames]);
}

function canonicalModule(specifier, file) {
  const resolved = specifier.startsWith('.')
    ? path.resolve(path.dirname(file), specifier)
    : specifier.startsWith('@/') ? path.join(HUB_ROOT, specifier.slice(2)) : null;
  return resolved?.replace(/\.(?:jsx?|tsx?)$/, '') || null;
}

function importedComponent(tag, checker, file) {
  const namespace = ts.isPropertyAccessExpression(tag);
  const identifier = namespace ? tag.expression : tag;
  if (!ts.isIdentifier(identifier)) return null;
  const symbol = checker.getSymbolAtLocation(identifier);
  for (const declaration of symbol?.declarations || []) {
    let exportedName;
    if (!namespace && ts.isImportSpecifier(declaration)) {
      exportedName = (declaration.propertyName || declaration.name).text;
    } else if (namespace && ts.isNamespaceImport(declaration)) {
      exportedName = tag.name.text;
    } else {
      continue; // Locally declared components and shadowing parameters are not imports.
    }
    let statement = declaration.parent;
    while (statement && !ts.isImportDeclaration(statement)) statement = statement.parent;
    if (!statement || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = canonicalModule(statement.moduleSpecifier.text, file);
    if (module === ICON_MODULE && exportedName === 'Iconed') return exportedName;
    if (module === PRIMITIVE_MODULE &&
        ['Button', 'IconButton', 'EmptyState', 'Input'].includes(exportedName)) return exportedName;
  }
  return null;
}

function literalStrings(node) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isJsxExpression(node)) return literalStrings(node.expression);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) return literalStrings(node.expression);
  if (ts.isConditionalExpression(node)) {
    return [...literalStrings(node.whenTrue), ...literalStrings(node.whenFalse)];
  }
  if (ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
    return [...literalStrings(node.left), ...literalStrings(node.right)];
  }
  return []; // Dynamic values require their own data-contract tests.
}

function hasAccessibleName(attribute) {
  if (!attribute?.initializer) return false;
  const value = attribute.initializer;
  if (ts.isStringLiteral(value)) return Boolean(value.text.trim());
  if (!ts.isJsxExpression(value) || !value.expression) return false;
  const expression = value.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return Boolean(expression.text.trim());
  }
  return ![ts.SyntaxKind.NullKeyword, ts.SyntaxKind.FalseKeyword].includes(expression.kind) &&
    !(ts.isIdentifier(expression) && expression.text === 'undefined');
}

function inspectSources(entries, names) {
  const parsed = new Map(entries.map(([file, source]) => [file, parse(file, source)]));
  const options = { allowJs: true, noLib: true, noResolve: true, jsx: ts.JsxEmit.Preserve };
  // One in-memory program provides scope-aware import binding without resolving or
  // loading any application module. It also avoids false positives from shadowing.
  const host = {
    ...ts.createCompilerHost(options),
    getSourceFile: file => parsed.get(file),
    fileExists: file => parsed.has(file),
    readFile: file => parsed.get(file)?.text,
  };
  const checker = ts.createProgram([...parsed.keys()], options, host).getTypeChecker();
  const issues = [];
  for (const [file, source] of parsed) {
    const report = (node, code, message) => {
      const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
      issues.push({ file, line: line + 1, column: character + 1, code, message });
    };
    for (const diagnostic of source.parseDiagnostics) {
      issues.push({ file, code: 'PARSE', message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') });
    }
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const component = importedComponent(node.tagName, checker, file);
        if (component) {
          const attributes = new Map(node.attributes.properties.filter(ts.isJsxAttribute)
            .map(attribute => [attribute.name.getText(source), attribute]));
          const keys = component === 'Iconed' ? ['name']
            : component === 'Button' ? ['icon', 'iconRight'] : ['icon'];
          for (const key of keys) {
            const attribute = attributes.get(key);
            for (const name of literalStrings(attribute?.initializer)) {
              // Optional icon="" is deliberately falsy in the primitives.
              if (!name && component !== 'Iconed') continue;
              if (!names.has(name)) report(attribute, 'UNKNOWN_ICON', `${component}.${key}: unknown icon "${name}"`);
            }
          }
          if (component === 'IconButton') {
            if (!hasAccessibleName(attributes.get('aria-label')) && !hasAccessibleName(attributes.get('tooltip'))) {
              report(node, 'ICON_BUTTON_NAME', 'IconButton needs an explicit tooltip or aria-label; label is unsupported');
            }
            for (const size of literalStrings(attributes.get('size')?.initializer)) {
              report(attributes.get('size'), 'ICON_BUTTON_SIZE', `IconButton size must be numeric, not "${size}"`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return issues;
}

async function collectSources(directory = HUB_ROOT) {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'build', 'coverage', 'generated'].includes(entry.name)) {
        entries.push(...await collectSources(file));
      }
    } else if (/\.[jt]sx?$/.test(entry.name) && !/\.(?:test|generated|min)\./.test(entry.name)) {
      entries.push([file, await readFile(file, 'utf8')]);
    }
  }
  return entries;
}

const registrySource = await readFile(`${ICON_MODULE}.jsx`, 'utf8');
const names = readRegistry(registrySource);
const inspect = source => inspectSources([[TEST_SOURCE, source]], names);

test('Hub icon consumers use registered names and the IconButton contract', async () => {
  const issues = inspectSources(await collectSources(), names);
  assert.deepEqual(issues, [], issues.map(issue =>
    `${path.relative(HUB_ROOT, issue.file)}:${issue.line || 1}: ${issue.message}`).join('\n'));
});

test('registry extraction rejects commented keys, duplicate keys, and invalid alias targets', () => {
  const source = `const I = { check: <path /> }; // imaginary: <path />
    const ICON_ALIASES = { tasks: 'check' };`;
  assert.deepEqual([...readRegistry(source)].sort(), ['check', 'tasks']);
  assert.throws(() => readRegistry(`// const I = { check: <path /> };`), /actual I registry/);
  assert.throws(() => readRegistry(`const I = { check: <path />, check: <path /> };`), /Duplicate icon key/);
  assert.throws(() => readRegistry(`const I = { check: <path /> }; const ICON_ALIASES = { tasks: 'typo' };`), /missing glyph typo/);
  assert.throws(() => readRegistry(`const I = { check: <path /> }; const ICON_ALIASES = { tasks: 'check', todos: 'tasks' };`), /missing glyph tasks/);
  assert.throws(() => readRegistry(`const I = { check: <path /> }; const ICON_ALIASES = { check: 'check' };`), /Duplicate icon alias/);
});

test('import aliases retain the original component and module contracts', () => {
  const issues = inspect(`
    import { Iconed as Glyph } from './hub-icons.jsx';
    import { IconButton as Action, Button as IconButton } from './hub-primitives';
    const a = <Glyph name="missing-glyph" />;
    const b = <Action icon="check" label="저장" size="sm" />;
    const c = <IconButton icon="check" size="sm">저장</IconButton>;
  `);
  assert.deepEqual(issues.map(issue => issue.code), ['UNKNOWN_ICON', 'ICON_BUTTON_NAME', 'ICON_BUTTON_SIZE']);
});

test('conditional, fallback, right-side, and namespace icon literals are checked', () => {
  const issues = inspect(`
    import * as Icons from '@/components/hub/hub-icons';
    import { Button, EmptyState, Input } from './hub-primitives.jsx';
    const a = <Icons.Iconed name={active ? 'check' : (candidate || 'bad-fallback')} />;
    const b = <Button iconRight={candidate ?? 'bad-right'}>열기</Button>;
    const c = <EmptyState icon={active ? 'bad-empty' : 'inbox'} />;
    const d = <Input icon={'bad-input'} />;
  `);
  assert.equal(issues.length, 4);
  for (const name of ['bad-fallback', 'bad-right', 'bad-empty', 'bad-input']) {
    assert.ok(issues.some(issue => issue.code === 'UNKNOWN_ICON' && issue.message.includes(name)));
  }
});

test('comments, other libraries, misleading aliases, and shadowed names are not Hub consumers', () => {
  assert.deepEqual(inspect(`
    import { Iconed as Glyph } from './hub-icons';
    import { IconButton as ForeignButton } from 'another-icon-library';
    import { Button as ForeignIcon } from '../other/hub-icons';
    import { SomethingElse as Iconed } from './hub-icons';
    // <Glyph name="comment-is-not-a-consumer" />
    const text = '<Glyph name="string-is-not-a-consumer" />';
    const a = <ForeignButton icon="foreign" size="small" />;
    const b = <ForeignIcon name="foreign" />;
    const c = <Iconed name="not-the-imported-Iconed-export" />;
    function Example(Glyph) { return <Glyph name="local-component" />; }
  `), []);
});

test('IconButton requires a nonempty name and rejects string sizes in expression branches', () => {
  const issues = inspect(`
    import { IconButton } from './hub-primitives';
    const a = <IconButton icon="check" tooltip="" label="unsupported" />;
    const b = <IconButton icon="check" aria-label="저장" size={compact ? 28 : 'sm'} />;
    const c = <IconButton icon="check" tooltip={ready ? '저장' : '대기'} size={28} />;
    const d = <IconButton icon="check" aria-label="저장" />;
  `);
  assert.deepEqual(issues.map(issue => issue.code), ['ICON_BUTTON_NAME', 'ICON_BUTTON_SIZE']);
});

test('supported registry aliases and dynamic values do not invent failures', () => {
  assert.deepEqual(inspect(`
    import { Iconed } from './hub-icons';
    import { Button, IconButton, EmptyState, Input } from './hub-primitives';
    const a = <Iconed name="tasks" />;
    const b = <Button icon={ready ? 'check' : undefined} iconRight={nextIcon}>저장</Button>;
    const c = <EmptyState icon={kind || 'inbox'} />;
    const d = <Input icon="" />;
    const e = <IconButton icon="edit" tooltip="편집" size={compact ? 28 : 32} />;
  `), []);
});
