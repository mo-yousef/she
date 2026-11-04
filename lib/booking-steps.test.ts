import { describe, it, expect } from 'vitest';
import {
  applicableSteps,
  clampStep,
  furthestStep,
  nextStep,
  prevStep,
  resolveStaffId,
  stepProgress,
} from './booking-steps';
import { buildBookingQuery, parseBookingParams } from './booking-params';

describe('step flow', () => {
  it('keeps all steps unless exactly one staff member offers the service', () => {
    expect(applicableSteps()).toEqual(['service', 'team', 'datetime', 'details', 'review']);
    expect(applicableSteps(2)).toContain('team');
    expect(applicableSteps(0)).toContain('team');
    expect(applicableSteps(1)).toEqual(['service', 'datetime', 'details', 'review']);
  });

  it('skips Team going forward and backward for a single-staff service', () => {
    const steps = applicableSteps(1);
    expect(nextStep(steps, 'service')).toBe('datetime');
    expect(prevStep(steps, 'datetime')).toBe('service');
    expect(prevStep(steps, 'service')).toBeUndefined();
    expect(nextStep(steps, 'review')).toBeUndefined();
    expect(stepProgress(steps, 'details')).toEqual({ index: 3, total: 4 });
  });

  it('defaults to the only staff member, else validates the choice', () => {
    expect(resolveStaffId(undefined, ['a'])).toBe('a');
    expect(resolveStaffId('zzz', ['a'])).toBe('a');
    expect(resolveStaffId('any', ['a', 'b'])).toBe('any');
    expect(resolveStaffId('b', ['a', 'b'])).toBe('b');
    expect(resolveStaffId('c', ['a', 'b'])).toBeUndefined();
    expect(resolveStaffId('any', [])).toBeUndefined();
  });

  it('finds the furthest allowed step from the selections', () => {
    const all = applicableSteps(2);
    expect(furthestStep({}, all, false)).toBe('service');
    expect(furthestStep({ serviceId: 's' }, all, false)).toBe('team');
    expect(furthestStep({ serviceId: 's', staffId: 'any' }, all, false)).toBe('datetime');
    expect(furthestStep({ serviceId: 's', staffId: 'any', slot: 'x' }, all, false)).toBe('details');
    expect(furthestStep({ serviceId: 's', staffId: 'any', slot: 'x' }, all, true)).toBe('review');
    expect(furthestStep({ serviceId: 's' }, applicableSteps(1), false)).toBe('datetime');
  });

  it('clamps deep links to a reachable step', () => {
    const all = applicableSteps(2);
    expect(clampStep('review', { serviceId: 's' }, all, true)).toBe('team');
    expect(clampStep('service', { serviceId: 's' }, all, true)).toBe('service');
    expect(clampStep('review', { serviceId: 's', staffId: 'a', slot: 'x' }, all, false)).toBe('details');
    // Team is skipped for single staff: a stale ?step=team lands on datetime.
    expect(clampStep('team', { serviceId: 's', staffId: 'a' }, applicableSteps(1), true)).toBe('datetime');
  });
});

describe('booking URL params', () => {
  it('parses valid params and normalises the slot', () => {
    const s = parseBookingParams({
      service: 'svc_1',
      staff: 'any',
      date: '2026-06-10',
      slot: '2026-06-10T07:00:00+00:00',
      step: 'details',
      days: '30',
    });
    expect(s).toEqual({
      serviceId: 'svc_1',
      staffId: 'any',
      date: '2026-06-10',
      slot: '2026-06-10T07:00:00.000Z',
      step: 'details',
      days: 30,
    });
  });

  it('drops invalid values instead of throwing', () => {
    const s = parseBookingParams({
      service: 'a b!',
      staff: '',
      date: '2026-02-31',
      slot: 'tomorrow',
      step: 'confirm',
      days: '500',
    });
    expect(s).toEqual({
      serviceId: undefined,
      staffId: undefined,
      date: undefined,
      slot: undefined,
      step: undefined,
      days: 60,
    });
    expect(parseBookingParams({ days: '3' }).days).toBe(14);
  });

  it('round-trips through buildBookingQuery, omitting defaults', () => {
    const state = parseBookingParams({ service: 's1', staff: 'any', step: 'datetime' });
    expect(buildBookingQuery(state)).toBe('service=s1&staff=any&step=datetime');
    expect(parseBookingParams(Object.fromEntries(new URLSearchParams(buildBookingQuery(state))))).toEqual(state);
  });
});
