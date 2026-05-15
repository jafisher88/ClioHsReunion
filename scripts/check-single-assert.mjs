#!/usr/bin/env node
/**
 * Audit script for acceptance A8.
 *
 * Walks every `tests/**\/*.test.ts` and asserts each `it()`/`test()`
 * callback body contains ≤ 1 `expect(...)` CallExpression at any depth.
 *
 * Opt-out: a `// @multi-assert` line comment on the line immediately
 * above the `it(` declaration excuses that one block. Use the pragma
 * sparingly — it's intentionally ugly so reviewers notice. Legitimate
 * cases are tests where multiple constraints describe a single logical
 * claim (e.g. a returned timestamp asserted to be within a ±2s window).
 *
 * Wired into `package.json` `pretest`, so `npm test` runs the audit
 * first.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;

const ROOT = resolve(process.cwd(), 'tests');
const failures = [];

function* walkTests(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walkTests(p);
    else if (entry.endsWith('.test.ts')) yield p;
  }
}

function isItOrTestCall(node) {
  // it(...) or test(...) bare identifier
  if (node.callee?.type === 'Identifier'
      && (node.callee.name === 'it' || node.callee.name === 'test')) {
    return { kind: 'bare', name: node.callee.name };
  }
  // it.skip / it.only / it.todo — these are skipped; don't audit (no body
  // runs, so an expect count is irrelevant)
  if (node.callee?.type === 'MemberExpression'
      && node.callee.object?.type === 'Identifier'
      && (node.callee.object.name === 'it' || node.callee.object.name === 'test')) {
    const prop = node.callee.property?.name;
    if (prop === 'skip' || prop === 'only' || prop === 'todo') return null;
    if (prop === 'each') return null; // handled by the it.each(...) variant below
  }
  // it.each(table)('desc', fn) — callee is itself a CallExpression
  if (node.callee?.type === 'CallExpression'
      && node.callee.callee?.type === 'MemberExpression'
      && node.callee.callee.object?.type === 'Identifier'
      && (node.callee.callee.object.name === 'it' || node.callee.callee.object.name === 'test')
      && node.callee.callee.property?.name === 'each') {
    return { kind: 'each', name: node.callee.callee.object.name };
  }
  return null;
}

function callbackBody(node) {
  const fn = node.arguments?.find(
    (a) => a?.type === 'ArrowFunctionExpression' || a?.type === 'FunctionExpression',
  );
  return fn?.body ?? null;
}

function countExpects(body) {
  let n = 0;
  const visit = (x) => {
    if (!x || typeof x !== 'object') return;
    if (x.type === 'CallExpression') {
      const c = x.callee;
      if (c?.type === 'Identifier' && c.name === 'expect') n++;
      // expect.objectContaining etc. — those are `expect.objectContaining(...)`
      // which is a MemberExpression callee on `expect`. Don't count those —
      // they're matcher constructors, not assertions. Only count bare
      // `expect(value)` calls.
    }
    for (const k of Object.keys(x)) {
      const v = x[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(body);
  return n;
}

// For each `it(` at a given line, return true iff *some* line in the
// contiguous comment block immediately above contains `@multi-assert`.
// Walks upward stopping at the first non-comment, non-blank line so the
// pragma can sit anywhere in a multi-line rationale block.
function hasPragmaAbove(sourceLines, lineNumber /* 1-based */) {
  for (let i = lineNumber - 2; i >= 0; i--) {
    const line = sourceLines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed === '') continue;             // blank line — keep walking
    if (!trimmed.startsWith('//')) return false; // first non-comment line — stop
    if (trimmed.includes('@multi-assert')) return true;
  }
  return false;
}

for (const file of walkTests(ROOT)) {
  const source = readFileSync(file, 'utf8');
  const sourceLines = source.split('\n');
  let ast;
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  } catch (err) {
    failures.push(`${file}: parse error — ${err.message}`);
    continue;
  }

  traverse(ast, {
    CallExpression(path) {
      const kind = isItOrTestCall(path.node);
      if (!kind) return;
      const body = callbackBody(path.node);
      if (!body) return;
      const expects = countExpects(body);
      if (expects <= 1) return;

      const startLine = path.node.loc?.start.line ?? 0;
      if (hasPragmaAbove(sourceLines, startLine)) return;

      const desc = path.node.arguments?.find((a) => a?.type === 'StringLiteral')?.value ?? '<unknown>';
      failures.push(
        `${file}:${startLine}: '${desc}' has ${expects} expect() calls (use it.each or add ` +
        '// @multi-assert pragma if intentional)',
      );
    },
  });
}

if (failures.length > 0) {
  console.error('[check-single-assert] FAIL:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('[check-single-assert] OK — every it()/test() block has ≤ 1 expect() (or carries the pragma)');
