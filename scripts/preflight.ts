export {};
const base = process.env.AGENT_URL ?? 'http://localhost:8091';
const response = await fetch(`${base}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer demo-alice' }, body: JSON.stringify({ message: 'Начисления 10001 за 2026-08' }) });
if (!response.ok) throw new Error(`Agent unavailable: HTTP ${response.status}`);
const result = await response.json();
if (result.events.length !== 2 || !result.answer.includes('150000')) throw new Error('Agent round trip failed');
console.log(JSON.stringify({ status: 'PASS', run_id: result.run_id, answer: result.answer }));
