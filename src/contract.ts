import { z } from 'zod';
export const modeSchema = z.enum(['success', 'empty', 'timeout', 'forbidden', 'error', 'injection']);
export type ToolMode = z.infer<typeof modeSchema>;
export interface Account { id: string; account_number: string }
export interface Charge { id: string; account_id: string; period: string; amount_kopecks: number }
export type Result<T> = { status: 'ok'; data: T } | {
  status: 'not_found' | 'forbidden' | 'timeout' | 'error'; message: string;
};
export const accountInput = z.object({ account_number: z.string().regex(/^\d{5}$/) }).strict();
export const chargesInput = z.object({ account_id: z.string(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();
export const runInput = z.object({
  message: z.string().min(1).max(4000),
  mode: z.enum(['mock', 'real']).default('mock'),
  tool_mode: modeSchema.default('success'),
}).strict();
export const modelSchema = z.enum(['interview-mock', 'interview-real']);
