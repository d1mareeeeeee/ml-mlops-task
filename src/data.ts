import { readFileSync } from 'node:fs';
import type { Account, Charge } from './contract.js';
export const fixture = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8')) as {
  version: string; accounts: Account[]; charges: Charge[]; sessions: Record<string, string[]>;
};
export function allowedAccounts(token: string): string[] | undefined {
  return Object.hasOwn(fixture.sessions, token) ? fixture.sessions[token] : undefined;
}
