import test from 'node:test';
import assert from 'node:assert/strict';
import { createTools } from '../src/tools.js';
import { allowedAccounts } from '../src/data.js';
test('server denies a foreign account even when called directly', async () => {
  const tools = createTools(['acc-alice'], 'success', []);
  const result = JSON.parse(await tools[1].invoke({ account_id: 'acc-bob', period: '2026-08' }));
  assert.equal(result.status, 'forbidden');
  assert.equal(result.data, undefined);
});
test('fixture preserves exact amounts', async () => {
  const tools = createTools(['acc-alice'], 'success', []);
  const result = JSON.parse(await tools[1].invoke({ account_id: 'acc-alice', period: '2026-08' }));
  assert.equal(result.data.reduce((sum: number, c: { amount_kopecks: number }) => sum + c.amount_kopecks, 0), 150000);
});
test('unknown sessions are rejected', () => assert.equal(allowedAccounts('__proto__'), undefined));
