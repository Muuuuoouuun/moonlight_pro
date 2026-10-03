#!/usr/bin/env node
// Bounded source syntax guard using the existing TypeScript parser.
// No type, import, style or ESLint-equivalent semantic analysis; no env loading.
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROOTS = ['apps', 'packages', 'scripts'];
const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'generated', 'dist', 'build', 'out', 'coverage']);
// Exclude sensitive configuration by name before opening any file or directory.
const SENSITIVE_NAME = /(?:^|[._-])(?:env|secret|secrets|credential|credentials|keystore)(?:[._-]|$)/i;
const GENERATED_FILE = /(?:\.generated\.|\.min\.|\.bundle\.)|^(?:hub-config\.js|next-env\.d\.ts)$/i;

export async function collectSourceFiles(root = DEFAULT_ROOT) {
  const files = [];
  async function walk(relative) {
    let entries;
    try {
      const directory = path.join(root, relative);
      if ((await lstat(directory)).isSymbolicLink()) return;
      entries = await readdir(directory, { withFileTypes: true });
    }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || SENSITIVE_NAME.test(entry.name)) continue;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        await walk(child);
      } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name)) && !GENERATED_FILE.test(entry.name)) {
        files.push(child);
      }
    }
  }
  for (const relative of ROOTS) await walk(relative);
  return files.sort();
}

export function inspectSourceSyntax(file, source) {
  const extension = path.extname(file);
  const kind = extension === '.tsx' ? ts.ScriptKind.TSX : extension === '.ts' ? ts.ScriptKind.TS
    : extension === '.js' || extension === '.jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const at = position => {
    const { line, character } = parsed.getLineAndCharacterOfPosition(position);
    return { file, line: line + 1, column: character + 1 };
  };
  const issues = parsed.parseDiagnostics.map(diagnostic => ({
    ...at(diagnostic.start ?? 0),
    code: diagnostic.code === 1185 ? 'MERGE_CONFLICT' : `TS${diagnostic.code}`,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
  function visit(node) {
    if (ts.isDebuggerStatement(node)) issues.push({ ...at(node.getStart(parsed)), code: 'DEBUGGER', message: 'Remove the debugger statement from source.' });
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return issues;
}

export async function lintSource({ root = DEFAULT_ROOT, readSource = file => readFile(file, 'utf8') } = {}) {
  const files = await collectSourceFiles(root);
  const issues = [];
  if (!files.length) issues.push({ code: 'NO_SOURCE_FILES', message: 'No eligible source files were checked in apps, packages or scripts.' });
  for (const file of files) issues.push(...inspectSourceSyntax(file, await readSource(path.join(root, file))));
  return { checked: files.length, issues };
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log('Usage: node scripts/lint-source.mjs [--root <directory>]');
    console.log('Bounded syntax, merge-conflict and debugger guard for apps/packages/scripts JS, JSX, TS, TSX, MJS and CJS.');
    console.log('Skips generated/build output, node_modules, hidden directories, symlinks and env/secret/credential configuration.');
    console.log('Uses TypeScript parse diagnostics; does not check types, imports, style or ESLint-equivalent semantics.');
    return;
  }
  if (argv.length && (argv.length !== 2 || argv[0] !== '--root' || !argv[1])) {
    console.error('Usage: node scripts/lint-source.mjs [--root <directory>]');
    process.exitCode = 1;
    return;
  }
  const result = await lintSource({ root: argv.length ? path.resolve(argv[1]) : DEFAULT_ROOT });
  for (const issue of result.issues) {
    const location = issue.file ? `${issue.file}:${issue.line}:${issue.column}: ` : '';
    console.error(`${location}[${issue.code}] ${issue.message}`);
  }
  console.log(`Source syntax guard: ${result.checked} files checked; ${result.issues.length} issues. No semantic/type/style analysis.`);
  if (result.issues.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(`Source syntax guard failed: ${error.code || error.name}`); process.exitCode = 1; });
}
