/**
 * Pure step-flow logic for the booking stepper (requirement 3.1).
 * Steps: Service -> Team -> Date/Time -> Details -> Review. "Confirm" is the
 * action on Review (the confirmation screen is task 4.4).
 */
export const STEPS = ['service', 'team', 'datetime', 'details', 'review'] as const;
export type Step = (typeof STEPS)[number];

export function isStep(v: unknown): v is Step {
  return typeof v === 'string' && (STEPS as readonly string[]).includes(v);
}

/**
 * Steps that apply. The Team step is skipped when exactly one staff member
 * offers the chosen service. `undefined` = no service chosen yet, keep all.
 */
export function applicableSteps(eligibleStaffCount?: number): Step[] {
  return eligibleStaffCount === 1 ? STEPS.filter((s) => s !== 'team') : [...STEPS];
}

/**
 * Staff selection after sanitising: a single eligible person is the default;
 * otherwise 'any' or an eligible id is kept and anything else dropped.
 */
export function resolveStaffId(staffId: string | undefined, eligibleIds: string[]): string | undefined {
  if (eligibleIds.length === 1) return eligibleIds[0];
  if (eligibleIds.length === 0) return undefined;
  if (staffId === 'any') return 'any';
  return staffId && eligibleIds.includes(staffId) ? staffId : undefined;
}

export function nextStep(steps: Step[], current: Step): Step | undefined {
  return steps[steps.indexOf(current) + 1];
}

export function prevStep(steps: Step[], current: Step): Step | undefined {
  const i = steps.indexOf(current);
  return i > 0 ? steps[i - 1] : undefined;
}

export interface FlowState {
  serviceId?: string;
  /** Already resolved (single-staff default applied). */
  staffId?: string;
  slot?: string;
}

/** The last step the current selections allow the user to be on. */
export function furthestStep(state: FlowState, steps: Step[], detailsComplete: boolean): Step {
  if (!state.serviceId) return 'service';
  if (steps.includes('team') && !state.staffId) return 'team';
  if (!state.slot) return 'datetime';
  if (!detailsComplete) return 'details';
  return 'review';
}

/** Never show a step the selections do not support (deep links, stale URLs). */
export function clampStep(
  requested: Step,
  state: FlowState,
  steps: Step[],
  detailsComplete: boolean,
): Step {
  const limit = furthestStep(state, steps, detailsComplete);
  // A skipped Team step falls through to the next applicable one.
  const wanted = steps.includes(requested) ? requested : requested === 'team' ? 'datetime' : steps[0]!;
  return steps.indexOf(wanted) <= steps.indexOf(limit) ? wanted : limit;
}

export function stepProgress(steps: Step[], current: Step): { index: number; total: number } {
  return { index: Math.max(0, steps.indexOf(current)) + 1, total: steps.length };
}
