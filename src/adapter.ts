import type { Charge, Result } from './contract.js';
export function adaptCharges(result: Result<Charge[]>): Result<Charge[]> {
  return result;
}
