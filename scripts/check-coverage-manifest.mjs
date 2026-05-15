#!/usr/bin/env node
/**
 * Audit script for acceptance A6.
 *
 * Reads `tests/coverage-manifest.ts` (the source of truth for rule IDs)
 * and confirms every ID appears as a substring of ≥ 1 `it()`/`test()`
 * description across `tests/**\/*.test.ts`. Uses @babel/parser for both
 * the manifest and the tests so a comment or a docstring cannot satisfy
 * the check.
 *
 * Exits 0 on pass; non-zero with a missing-IDs list on fail.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;

const MANIFEST_FILE = resolve(process.cwd(), 'tests/coverage-manifest.ts');
const TESTS_ROOT = resolve(process.cwd(), 'tests');

function parseFile(path) {
  return parse(readFileSync(path, 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript'],
  });
}

function* walkTests(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walkTests(p);
    else if (entry.endsWith('.test.ts')) yield p;
  }
}

// Extract every it()/test() description string from one parsed file.
// Handles bare it(...) and it.each([...])('desc', fn) but not .skip/.todo
// (those would mean the rule isn't actually being tested).
function describeStrings(ast) {
  const out = [];
  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      const c = node.callee;

      // Bare `it('x', ...)` / `test('x', ...)`
      if (c.type === 'Identifier' && (c.name === 'it' || c.name === 'test')) {
        const arg = node.arguments?.[0];
        if (arg?.type === 'StringLiteral') out.push(arg.value);
        return;
      }

      // `it.each(table)('x', ...)` — the outer call's callee is itself a call
      if (c.type === 'CallExpression'
          && c.callee?.type === 'MemberExpression'
          && c.callee.object?.type === 'Identifier'
          && (c.callee.object.name === 'it' || c.callee.object.name === 'test')
          && c.callee.property?.name === 'each') {
        const arg = node.arguments?.[0];
        if (arg?.type === 'StringLiteral') out.push(arg.value);
      }
    },
  });
  return out;
}

// Read the manifest IDs out of the AST so a `// comment` listing them
// cannot satisfy the check. The manifest is `export const COVERAGE_MANIFEST: string[] = [ ... ]`.
function readManifestIds(ast) {
  const out = [];
  traverse(ast, {
    VariableDeclarator(path) {
      const id = path.node.id;
      if (id?.type !== 'Identifier' || id.name !== 'COVERAGE_MANIFEST') return;
      const init = path.node.init;
      // The array may be wrapped in TS `as const` etc.; drill in.
      let arr = init;
      while (arr && arr.type === 'TSAsExpression') arr = arr.expression;
      if (arr?.type !== 'ArrayExpression') return;
      for (const el of arr.elements) {
        if (el?.type === 'StringLiteral') out.push(el.value);
      }
    },
  });
  return out;
}

const manifestIds = readManifestIds(parseFile(MANIFEST_FILE));
if (manifestIds.length === 0) {
  console.error('[check-coverage-manifest] FAIL: manifest exports no rule IDs');
  process.exit(1);
}

// Collect every it()/test() description across the suite.
const allDescriptions = [];
for (const file of walkTests(TESTS_ROOT)) {
  allDescriptions.push(...describeStrings(parseFile(file)));
}

const missing = manifestIds.filter(
  (id) => !allDescriptions.some((desc) => desc.includes(id)),
);

if (missing.length > 0) {
  console.error(`[check-coverage-manifest] FAIL: ${missing.length} manifest ID(s) have no matching it() description:`);
  for (const id of missing) console.error(`  - ${id}`);
  process.exit(1);
}

console.log(`[check-coverage-manifest] OK — all ${manifestIds.length} manifest rule IDs covered`);
