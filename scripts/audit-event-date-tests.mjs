#!/usr/bin/env node
/**
 * Audit script for acceptance A1, A2, A3.
 *
 * A1 — `tests/event-date.test.ts` `describe('toRoman', ...)` must contain
 *      an `it.each([...])` table covering every pinned [input, expected]
 *      pair (10 valid + 3 invalid). Tested via AST: a grep on numeric
 *      literals would match comments and assertions and is gameable.
 *
 * A2 — `describe('getEventDateInfo', ...)` must include children whose
 *      descriptions start with each of `locked`, `unset`, `malformed`,
 *      `throws`. Each must contain ≥ 1 `expect(...)`.
 *
 * A3 — `tests/event-date.tz.test.ts` must reference both TZ extremes
 *      (`'Pacific/Kiritimati'` and `'Etc/GMT+12'`) AND a `vi.stubEnv`
 *      CallExpression with first argument `'TZ'`. Checked via AST so a
 *      comment alone doesn't satisfy the requirement.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;

const MAIN_FILE = resolve(process.cwd(), 'tests/event-date.test.ts');
const TZ_FILE = resolve(process.cwd(), 'tests/event-date.tz.test.ts');

// A1 pinned tables. Order matters within each list — the audit walks the
// it.each tuples sequentially and matches positionally so a row drop or
// reorder is caught.
const ROMAN_VALID = [
  [1, 'I'], [4, 'IV'], [9, 'IX'], [40, 'XL'], [90, 'XC'],
  [400, 'CD'], [900, 'CM'], [1994, 'MCMXCIV'], [2026, 'MMXXVI'], [3999, 'MMMCMXCIX'],
];
const ROMAN_INVALID = [
  [0, '0'], [-1, '-1'], [Number.NaN, 'NaN'],
];

// A2 required block names.
const EVENT_DATE_REQUIRED = ['locked', 'unset', 'malformed', 'throws'];

const failures = [];
const fail = (msg) => failures.push(msg);

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

function parseFile(path) {
  return parse(readFileSync(path, 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript'],
  });
}

function isCalleeName(callee, name) {
  return callee?.type === 'Identifier' && callee.name === name;
}

function describeName(node) {
  // describe('x', ...) → 'x'
  if (node?.type !== 'CallExpression') return null;
  if (!isCalleeName(node.callee, 'describe')) return null;
  const first = node.arguments?.[0];
  return first?.type === 'StringLiteral' ? first.value : null;
}

function itDescription(node) {
  // it('x', ...) → 'x'.   it.each([...])('x', ...) → 'x'.
  if (node?.type !== 'CallExpression') return null;
  let outerArgs = node.arguments;
  // Reject it.skip / it.only / it.todo
  if (node.callee.type === 'MemberExpression' && node.callee.object?.type === 'Identifier'
      && (node.callee.object.name === 'it' || node.callee.object.name === 'test')) {
    const prop = node.callee.property?.name;
    if (prop === 'skip' || prop === 'only' || prop === 'todo') return null;
    if (prop !== 'each') return null;
    // it.each(...) is fine — fall through, look at the outer call
  }
  // it.each([...])('x', ...) — callee is a CallExpression
  if (node.callee.type === 'CallExpression') {
    if (node.callee.callee?.type !== 'MemberExpression') return null;
    if (node.callee.callee.property?.name !== 'each') return null;
    outerArgs = node.arguments;
  } else if (!isCalleeName(node.callee, 'it') && !isCalleeName(node.callee, 'test')) {
    return null;
  }
  const first = outerArgs?.[0];
  return first?.type === 'StringLiteral' ? first.value : null;
}

function countExpectCalls(body) {
  let count = 0;
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'CallExpression') {
      const c = n.callee;
      // expect(...) directly
      if (isCalleeName(c, 'expect')) count++;
      // expect(...).whatever  — only count the outer expect(...) call
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(body);
  return count;
}

// Extract the literal array passed to it.each([...]).
function eachTable(node) {
  // node is the outer CallExpression: it.each(table)('desc', fn).
  // it.each(...) call is `node.callee`.
  if (node.callee?.type !== 'CallExpression') return null;
  const tableArg = node.callee.arguments?.[0];
  if (tableArg?.type !== 'ArrayExpression') return null;
  return tableArg.elements.map((row) => {
    if (row?.type !== 'ArrayExpression') return null;
    return row.elements.map((el) => {
      if (el?.type === 'NumericLiteral') return el.value;
      if (el?.type === 'StringLiteral') return el.value;
      if (el?.type === 'UnaryExpression' && el.operator === '-' && el.argument?.type === 'NumericLiteral') {
        return -el.argument.value;
      }
      if (el?.type === 'MemberExpression'
          && el.object?.name === 'Number' && el.property?.name === 'NaN') {
        return Number.NaN;
      }
      return null;
    });
  });
}

function rowsMatch(actual, expected) {
  if (!actual || actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i];
    const e = expected[i];
    if (!a || a.length !== e.length) return false;
    for (let j = 0; j < e.length; j++) {
      const av = a[j];
      const ev = e[j];
      if (typeof ev === 'number' && Number.isNaN(ev)) {
        if (!(typeof av === 'number' && Number.isNaN(av))) return false;
      } else if (av !== ev) {
        return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// A1, A2 — main file
// ---------------------------------------------------------------------------

const mainAst = parseFile(MAIN_FILE);

let toRomanDescribe = null;
let eventDateDescribe = null;

traverse(mainAst, {
  CallExpression(path) {
    const name = describeName(path.node);
    if (name === 'toRoman') toRomanDescribe = path.node;
    if (name === 'getEventDateInfo') eventDateDescribe = path.node;
  },
});

if (!toRomanDescribe) fail('A1: no describe("toRoman", ...) found in tests/event-date.test.ts');
if (!eventDateDescribe) fail('A2: no describe("getEventDateInfo", ...) found in tests/event-date.test.ts');

// A1 — walk the toRoman describe body for two it.each blocks
if (toRomanDescribe) {
  const body = toRomanDescribe.arguments[1]?.body?.body ?? [];
  const eachCalls = [];
  for (const stmt of body) {
    if (stmt.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    if (expr?.type !== 'CallExpression') continue;
    if (expr.callee?.type !== 'CallExpression') continue;
    if (expr.callee.callee?.property?.name !== 'each') continue;
    eachCalls.push(expr);
  }
  if (eachCalls.length < 2) {
    fail(`A1: expected ≥ 2 it.each(...) calls inside describe("toRoman"), got ${eachCalls.length}`);
  } else {
    const validTable = eachTable(eachCalls[0]);
    const invalidTable = eachTable(eachCalls[1]);
    if (!rowsMatch(validTable, ROMAN_VALID)) {
      fail(`A1: first it.each table does not match the pinned valid set. Got ${JSON.stringify(validTable)}`);
    }
    if (!rowsMatch(invalidTable, ROMAN_INVALID)) {
      fail(`A1: second it.each table does not match the pinned invalid set. Got ${JSON.stringify(invalidTable)}`);
    }
  }
}

// A2 — required named blocks under describe('getEventDateInfo')
if (eventDateDescribe) {
  const body = eventDateDescribe.arguments[1]?.body?.body ?? [];
  const children = [];
  for (const stmt of body) {
    if (stmt.type !== 'ExpressionStatement') continue;
    const desc = itDescription(stmt.expression);
    if (desc == null) continue;
    const fnBody = stmt.expression.arguments?.find(
      (a) => a?.type === 'ArrowFunctionExpression' || a?.type === 'FunctionExpression',
    )?.body;
    children.push({ desc, expects: countExpectCalls(fnBody) });
  }
  for (const required of EVENT_DATE_REQUIRED) {
    const match = children.find((c) => c.desc.startsWith(required));
    if (!match) {
      fail(`A2: no child of describe('getEventDateInfo') has a description starting with '${required}'`);
    } else if (match.expects < 1) {
      fail(`A2: child '${match.desc}' has 0 expect() calls`);
    }
  }
}

// ---------------------------------------------------------------------------
// A3 — TZ file
// ---------------------------------------------------------------------------

const tzSource = readFileSync(TZ_FILE, 'utf8');
const tzAst = parseFile(TZ_FILE);

// Literal string presence is a quick sanity check; AST is the real check.
const tzStringsRequired = ['Pacific/Kiritimati', 'Etc/GMT+12'];
for (const s of tzStringsRequired) {
  if (!tzSource.includes(s)) fail(`A3: tests/event-date.tz.test.ts does not contain '${s}'`);
}

let stubEnvSeen = false;
traverse(tzAst, {
  CallExpression(path) {
    const callee = path.node.callee;
    if (callee?.type !== 'MemberExpression') return;
    if (callee.object?.name !== 'vi') return;
    if (callee.property?.name !== 'stubEnv') return;
    const first = path.node.arguments?.[0];
    if (first?.type === 'StringLiteral' && first.value === 'TZ') stubEnvSeen = true;
  },
});
if (!stubEnvSeen) fail("A3: tests/event-date.tz.test.ts has no vi.stubEnv('TZ', ...) call");

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error('[audit-event-date-tests] FAIL:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[audit-event-date-tests] OK — A1, A2, A3 satisfied');
