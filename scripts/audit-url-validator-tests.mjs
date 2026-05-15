#!/usr/bin/env node
/**
 * Audit script for acceptance A4.
 *
 * Asserts `tests/url-validator.test.ts` contains the pinned accept/reject/
 * null-contract input sets for `parseHttpUrl`. AST-based, not grep —
 * walks each `it.each([...])` table and confirms the literal inputs match
 * the security contract pinned in plan.md.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;

const FILE = resolve(process.cwd(), 'tests/url-validator.test.ts');

// A reject input is "covered" when it appears as the first element of a
// row inside an it.each table within `describe('parseHttpUrl — reject set
// ...')`. Same shape for the null contract.
const REQUIRED_REJECT = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  '  javascript:x',
  'data:text/html,x',
  'ftp://x',
  'file:///etc/passwd',
  '//example.com',
  'vbscript:x',
  'http:',
  'not-a-url',
];

// Null contract requires at least null and undefined (no-value paths) plus
// empty/whitespace strings (clamps to no-value).
const REQUIRED_NULL_PRIMITIVES = ['null', 'undefined'];
const REQUIRED_NULL_STRINGS = ['', '   '];

// Accept set requires at least one each for http:// and https://.
const ACCEPT_PREFIXES = ['http://', 'https://'];

const failures = [];
const fail = (msg) => failures.push(msg);

const ast = parse(readFileSync(FILE, 'utf8'), {
  sourceType: 'module',
  plugins: ['typescript'],
});

function literalValue(node) {
  if (!node) return undefined;
  if (node.type === 'StringLiteral') return { kind: 'string', value: node.value };
  if (node.type === 'NullLiteral') return { kind: 'null', value: null };
  if (node.type === 'Identifier' && node.name === 'undefined') return { kind: 'undefined', value: undefined };
  return { kind: 'other', value: undefined };
}

function describeName(node) {
  if (node?.type !== 'CallExpression') return null;
  if (node.callee?.type !== 'Identifier' || node.callee.name !== 'describe') return null;
  const first = node.arguments?.[0];
  return first?.type === 'StringLiteral' ? first.value : null;
}

// For each describe block, collect the first-arg literals across every
// it.each([...])(...)' row in its body.
function collectFirstArgsInDescribe(describeNode) {
  const out = [];
  const body = describeNode.arguments?.[1]?.body?.body ?? [];
  for (const stmt of body) {
    if (stmt.type !== 'ExpressionStatement') continue;
    const call = stmt.expression;
    if (call?.type !== 'CallExpression') continue;
    // it.each([...])('desc', fn)  — outer call's callee is the it.each(...) call
    if (call.callee?.type !== 'CallExpression') continue;
    if (call.callee.callee?.type !== 'MemberExpression') continue;
    if (call.callee.callee.property?.name !== 'each') continue;
    const table = call.callee.arguments?.[0];
    if (table?.type !== 'ArrayExpression') continue;
    for (const row of table.elements) {
      if (row?.type !== 'ArrayExpression') continue;
      out.push(literalValue(row.elements?.[0]));
    }
  }
  return out;
}

let rejectInputs = null;
let nullInputs = null;
let acceptDescribeSeen = false;
let acceptUrls = [];

traverse(ast, {
  CallExpression(path) {
    const name = describeName(path.node);
    if (name === null) return;
    if (name.startsWith('parseHttpUrl — reject')) {
      rejectInputs = collectFirstArgsInDescribe(path.node);
    } else if (name.startsWith('parseHttpUrl — null')) {
      nullInputs = collectFirstArgsInDescribe(path.node);
    } else if (name.startsWith('parseHttpUrl — accept')) {
      acceptDescribeSeen = true;
      // For accept, the inputs are inside bare it(...) blocks calling
      // parseHttpUrl with a string literal. Walk the body for that.
      const body = path.node.arguments?.[1]?.body?.body ?? [];
      for (const stmt of body) {
        if (stmt.type !== 'ExpressionStatement') continue;
        const it = stmt.expression;
        if (it?.type !== 'CallExpression') continue;
        if (it.callee?.type !== 'Identifier' || it.callee.name !== 'it') continue;
        // Walk the callback body for parseHttpUrl(...) calls with string args.
        const fn = it.arguments?.find((a) => a?.type === 'ArrowFunctionExpression' || a?.type === 'FunctionExpression');
        const fnBody = fn?.body;
        const visit = (n) => {
          if (!n || typeof n !== 'object') return;
          if (n.type === 'CallExpression' && n.callee?.type === 'Identifier'
              && n.callee.name === 'parseHttpUrl' && n.arguments?.[0]?.type === 'StringLiteral') {
            acceptUrls.push(n.arguments[0].value);
          }
          for (const k of Object.keys(n)) {
            const v = n[k];
            if (Array.isArray(v)) v.forEach(visit);
            else if (v && typeof v === 'object') visit(v);
          }
        };
        visit(fnBody);
      }
    }
  },
});

if (!rejectInputs) fail('A4: no describe("parseHttpUrl — reject…") block found');
if (!nullInputs)   fail('A4: no describe("parseHttpUrl — null…") block found');
if (!acceptDescribeSeen) fail('A4: no describe("parseHttpUrl — accept…") block found');

if (rejectInputs) {
  const rejectStrings = rejectInputs
    .filter((v) => v?.kind === 'string')
    .map((v) => v.value);
  for (const required of REQUIRED_REJECT) {
    if (!rejectStrings.includes(required)) {
      fail(`A4: reject set missing input ${JSON.stringify(required)}`);
    }
  }
}

if (nullInputs) {
  const kinds = nullInputs.map((v) => v?.kind);
  for (const k of REQUIRED_NULL_PRIMITIVES) {
    if (!kinds.includes(k)) fail(`A4: null contract missing primitive '${k}'`);
  }
  const strings = nullInputs.filter((v) => v?.kind === 'string').map((v) => v.value);
  for (const s of REQUIRED_NULL_STRINGS) {
    if (!strings.includes(s)) fail(`A4: null contract missing string ${JSON.stringify(s)}`);
  }
}

if (acceptDescribeSeen) {
  for (const prefix of ACCEPT_PREFIXES) {
    if (!acceptUrls.some((u) => u.startsWith(prefix))) {
      fail(`A4: accept set has no input starting with '${prefix}'`);
    }
  }
}

if (failures.length > 0) {
  console.error('[audit-url-validator-tests] FAIL:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[audit-url-validator-tests] OK — A4 reject/accept/null contracts pinned');
