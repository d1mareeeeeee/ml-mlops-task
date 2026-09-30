import type { Charge, Result } from './contract.js';
export function adaptCharges(result: Result<Charge[]>): Result<Charge[]> {
  if (result.status === 'timeout') return { status: 'ok', data: [] };
  return result;
}
