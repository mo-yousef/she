/** Pure report vocabulary for owner review reports (task 6.8); safe to import from client code. */
import { z } from 'zod';

export const REPORT_REASONS = ['spam', 'offensive', 'not_customer', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Open (FLAGGED, not yet decided) reports per business; stops report-as-hide abuse. */
export const MAX_OPEN_REPORTS = 5;

export const reportReviewSchema = z.object({
  reviewId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
});
