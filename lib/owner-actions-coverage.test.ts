/**
 * Guard (task 6.9, req 5.1): every owner mutation must revalidate and audit. HEURISTIC string
 * checks on source text (no AST): they catch a forgotten import/call, not a wrong one. Real
 * behaviour is covered by e2e/owner-effects.spec.ts and lib/owner-effects.test.ts.
 *
 * To add a new owner action: put the wrapper in app/actions/<name>.ts and add the file to
 * OWNER_ACTION_FILES; put the core in lib/<name>.ts and add it to AUDITED_CORES. The wrapper must
 * call `revalidateAfterOwnerEdit` (or `revalidateBusinessPublic`); the core must `writeAudit(`
 * (inside the transaction that makes the change).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const OWNER_ACTION_FILES = [
  'onboarding',
  'calendar',
  'services',
  'team',
  'hours',
  'profile',
  'photos',
  'settings',
  'review-manage',
  'review-reply',
];

const AUDITED_CORES = [
  'onboarding',
  'manual-booking',
  'block',
  'booking-status-change',
  'services',
  'team',
  'business-hours',
  'profile',
  'photos',
  'settings-save',
  'review-manage',
  'review-reply',
];

/** Wrapper-level functions that legitimately change nothing (no revalidation). */
const NO_EFFECT_FUNCTIONS = new Set(['createUploadSignature']);

function exportedAsyncFunctions(src: string): string[] {
  return [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]!);
}

describe('owner action coverage (heuristic)', () => {
  it.each(OWNER_ACTION_FILES)('app/actions/%s.ts revalidates via the shared helpers', (name) => {
    const rel = `app/actions/${name}.ts`;
    const src = read(rel);
    const fns = exportedAsyncFunctions(src).filter((f) => !NO_EFFECT_FUNCTIONS.has(f));
    expect(fns.length, `${rel}: no exported async functions found`).toBeGreaterThan(0);
    const uses = /revalidateAfterOwnerEdit\(|revalidateBusinessPublic\(/.test(src);
    expect(
      uses,
      `${rel} (${fns.join(', ')}) must call revalidateAfterOwnerEdit(...) or revalidateBusinessPublic(...) after a successful core call`,
    ).toBe(true);
    expect(src, `${rel} is missing 'use server'`).toMatch(/^'use server';/m);
  });

  it.each(AUDITED_CORES)('lib/%s.ts writes an audit row', (name) => {
    const rel = `lib/${name}.ts`;
    const src = read(rel);
    expect(
      /writeAudit\(|auditLog\.create\(/.test(src),
      `${rel} must call writeAudit( or auditLog.create( for every mutation (req 5.1)`,
    ).toBe(true);
  });

  it('no core writes an audit row outside a transaction client', () => {
    // A bare `writeAudit({...})` (single argument, no `tx`) is the "lost or orphaned audit" bug.
    for (const name of AUDITED_CORES) {
      const src = read(`lib/${name}.ts`);
      for (const m of src.matchAll(/writeAudit\(([\s\S]*?)\);/g)) {
        expect(/\btx\b/.test(m[1]!), `lib/${name}.ts: writeAudit( without the transaction client (tx)`).toBe(true);
      }
    }
  });

  it('wrappers never revalidate inside a transaction', () => {
    for (const name of OWNER_ACTION_FILES) {
      expect(read(`app/actions/${name}.ts`), `app/actions/${name}.ts must not open a transaction`).not.toMatch(/\$transaction/);
    }
  });
});
