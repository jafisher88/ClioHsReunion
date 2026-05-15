#!/usr/bin/env node
/**
 * Audit script for acceptance A7.
 *
 * Asserts that `tests/personalization.test.ts` contains EXACTLY 2 active
 * `it()` / `test()` blocks — no `.skip`, no `.todo`, no `.only` — and that
 * their descriptions match the two pinned regexes.
 *
 * Uses @babel/parser (already a transitive dep via Astro/Vite). Exits 0 on
 * pass; exits non-zero with a diagnostic on fail.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

// @babel/traverse ships as CJS with the default export under .default; the
// project is ESM so we have to dig it out manually.
const traverse = _traverse.default ?? _traverse;

const FILE = resolve(process.cwd(), 'tests/personalization.test.ts');
const EXPECTED = [
  /substitutes.*\{firstName\}/i,
  /every|all occurrences?/i,
];

function fail(msg) {
  console.error(`[audit-personalization-tests] FAIL: ${msg}`);
  process.exit(1);
}

const source = readFileSync(FILE, 'utf8');
const ast = parse(source, {
  sourceType: 'module',
  plugins: ['typescript'],
});

const activeBlocks = [];

traverse(ast, {
  CallExpression(path) {
    const callee = path.node.callee;
    // Match bare `it(...)` and `test(...)`. Reject `it.skip`, `it.todo`,
    // `it.only`, `it.each`, etc. — anything that's a MemberExpression on
    // top of `it`/`test`.
    if (callee.type !== 'Identifier') return;
    if (callee.name !== 'it' && callee.name !== 'test') return;

    const desc = path.node.arguments[0];
    if (!desc || desc.type !== 'StringLiteral') {
      fail(`${callee.name}() with non-string description at line ${path.node.loc?.start.line ?? '?'}`);
    }
    activeBlocks.push({ desc: desc.value, line: path.node.loc?.start.line });
  },
});

if (activeBlocks.length !== EXPECTED.length) {
  fail(
    `expected exactly ${EXPECTED.length} active it()/test() blocks, found ${activeBlocks.length}` +
    activeBlocks.map((b) => `\n  line ${b.line}: ${JSON.stringify(b.desc)}`).join(''),
  );
}

for (let i = 0; i < EXPECTED.length; i++) {
  if (!EXPECTED[i].test(activeBlocks[i].desc)) {
    fail(
      `block #${i + 1} description ${JSON.stringify(activeBlocks[i].desc)} ` +
      `does not match expected pattern ${EXPECTED[i]}`,
    );
  }
}

console.log(`[audit-personalization-tests] OK — ${activeBlocks.length} active blocks match pinned regexes`);
