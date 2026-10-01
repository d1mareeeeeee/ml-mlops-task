import test from 'node:test';
import assert from 'node:assert/strict';
import { createTools, type ToolEvent } from '../src/tools.js';
const charges = { account_id: 'acc-alice', period: '2026-08' };
const statusOf = (payload: unknown) => (payload as { status: string }).status;
test('timeout stays a failure and never becomes an empty success', async () => {
  const tools = createTools(['acc-alice'], 'timeout', []);
  const result = JSON.parse(await tools[1].invoke(charges));
  assert.notEqual(result.status, 'ok');
  assert.equal(result.status, 'timeout');
  assert.equal(result.data, undefined);
});
test('the event log records the status the source actually returned', async () => {
  const events: ToolEvent[] = [];
  const tools = createTools(['acc-alice'], 'timeout', events);
  await tools[1].invoke(charges);
  assert.equal(events.length, 1);
  assert.equal(statusOf(events[0].source), statusOf(events[0].result));
});
// Guard, не доказательство регрессии: зелёный и до, и после исправления.
// Держит CONTRACT.md:52 — ok с пустым массивом это успешное чтение пустого
// периода, а не отказ источника.
test('an empty period stays a successful read', async () => {
  const tools = createTools(['acc-alice'], 'empty', []);
  const result = JSON.parse(await tools[1].invoke(charges));
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.data, []);
});
