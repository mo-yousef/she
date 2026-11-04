import { z } from 'zod';

/**
 * Per-business booking rules (requirements §6). Stored as JSON on Business and
 * validated with this schema wherever it is read or written.
 */
export const businessSettingsSchema = z.object({
  slotIntervalMin: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
  bufferMin: z.number().int().min(0).max(240).default(0),
  minLeadMin: z.number().int().min(0).max(10080).default(60),
  maxAdvanceDays: z.number().int().min(1).max(365).default(60),
  cancellationWindowHours: z.number().int().min(0).max(336).default(24),
  autoConfirm: z.boolean().default(true),
  maxPerCustomerPerDay: z.number().int().min(1).max(20).default(3),
});

export type BusinessSettings = z.infer<typeof businessSettingsSchema>;

export const DEFAULT_SETTINGS: BusinessSettings = businessSettingsSchema.parse({});

export function parseSettings(value: unknown): BusinessSettings {
  const result = businessSettingsSchema.safeParse(value ?? {});
  return result.success ? result.data : DEFAULT_SETTINGS;
}
