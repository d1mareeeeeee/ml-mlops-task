import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { runInput, modeSchema, modelSchema, accountInput, chargesInput } from './contract.js';
import { allowedAccounts } from './data.js';
import { runAgent } from './agent.js';
import { createTools } from './tools.js';
import { mockReply, sendCompletion } from './mock-model.js';
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 65536) throw new Error('Request too large'); }
  return JSON.parse(data || '{}');
}
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/health') return json(res, 200, { status: 'ok', component: '@librechat/agents@3.9.8' });
    if (req.method !== 'POST') return json(res, 404, { error: 'Not found' });
    const input = await body(req);
    if (req.url === '/mock/v1/chat/completions') {
      if (req.headers.authorization !== 'Bearer mock-local') return json(res, 401, { error: 'Unauthorized' });
      return sendCompletion(res, mockReply(input.messages), input.stream === true, 'interview-mock-v1');
    }
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const allowed = allowedAccounts(token);
    if (!allowed) return json(res, 401, { error: 'Unknown test session' });
    if (req.url === '/run') {
      const request = runInput.parse(input);
      return json(res, 200, await runAgent(request.message, allowed, request.mode, request.tool_mode));
    }
    if (req.url?.startsWith('/tools/')) {
      const tools = createTools(allowed, modeSchema.parse(input.tool_mode ?? 'success'), []);
      if (req.url === '/tools/get_account') return json(res, 200, JSON.parse(await tools[0].invoke(accountInput.parse(input.args))));
      if (req.url === '/tools/get_charges') return json(res, 200, JSON.parse(await tools[1].invoke(chargesInput.parse(input.args))));
      return json(res, 404, { error: 'Unknown tool' });
    }
    if (req.url === '/v1/chat/completions') {
      const message = [...input.messages].reverse().find((m: { role: string }) => m.role === 'user')?.content;
      const selectedModel = modelSchema.parse(input.model);
      const mode = selectedModel === 'interview-real' ? 'real' : 'mock';
      const toolMode = modeSchema.parse(String(req.headers['x-tool-mode'] ?? 'success'));
      const request = runInput.parse({ message, mode, tool_mode: toolMode });
      const result = await runAgent(request.message, allowed, request.mode, request.tool_mode);
      return sendCompletion(res, { content: result.answer }, input.stream === true, input.model);
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const blocked = message.startsWith('BLOCKED:');
    const validation = error instanceof Error && error.name === 'ZodError';
    json(res, blocked ? 503 : validation ? 400 : 500, { status: blocked ? 'BLOCKED' : 'ERROR', error: blocked ? message : validation ? 'Invalid request; see CONTRACT.md' : 'Agent execution failed; inspect local logs' });
    if (!blocked && !validation) console.error(error instanceof Error ? error.name : 'Unknown error');
  }
});
server.listen(Number(process.env.PORT ?? 8090), '0.0.0.0', () => console.log('Agent server ready'));
