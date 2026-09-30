import type { ServerResponse } from 'node:http';
interface Message { role: string; content?: string | null; tool_calls?: { function: { name: string } }[] }
interface Completion { content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
function call(name: string, args: Record<string, string>): Completion {
  return { content: null, tool_calls: [{ id: `call_${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] };
}
export function mockReply(messages: Message[]): Completion {
  const prompt = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
  const account = prompt.match(/\b\d{5}\b/)?.[0];
  const period = prompt.match(/\b\d{4}-(?:0[1-9]|1[0-2])\b/)?.[0];
  if (!account || !period) return { content: 'Уточните номер лицевого счёта и месяц в формате YYYY-MM.' };
  const results = messages.filter(m => m.role === 'tool');
  if (!results.length) return call('get_account', { account_number: account });
  const latest = JSON.parse(results.at(-1)?.content ?? '{}') as {
    status: string; data?: { id: string } | { amount_kopecks: number }[];
  };
  if (latest.status !== 'ok') return { content: `Невозможно получить начисления: ${latest.status}.` };
  if (results.length === 1 && latest.data && !Array.isArray(latest.data)) {
    return call('get_charges', { account_id: latest.data.id, period });
  }
  const charges = Array.isArray(latest.data) ? latest.data : [];
  const total = charges.reduce((sum, c) => sum + c.amount_kopecks, 0);
  return { content: `Счёт ${account}, период ${period}. Начислено ${total} коп. Источник успешно прочитан.` };
}
export function sendCompletion(res: ServerResponse, reply: Completion, stream: boolean, model: string) {
  const base = { id: `chatcmpl-${crypto.randomUUID()}`, created: Math.floor(Date.now() / 1000), model };
  const finish = reply.tool_calls ? 'tool_calls' : 'stop';
  if (!stream) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', ...reply }, finish_reason: finish }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }));
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  const delta = { role: 'assistant', ...reply, tool_calls: reply.tool_calls?.map((t, index) => ({ index, ...t })) };
  res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } })}\n\n`);
  res.end('data: [DONE]\n\n');
}
