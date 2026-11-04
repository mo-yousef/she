/**
 * DB-backed tests for the owner calendar cores (task 6.2, req 5.1): manual bookings, time
 * blocks (single + recurring), status changes and their authorisation, races and audit
 * rows. Real Postgres; the lib cores behind the 'use server' wrappers are called directly
 * with explicit inputs (session user id, clock) like reviews.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { createBookingRecord, manageTokenFor } from '../lib/booking';
import { createManualBookingCore } from '../lib/manual-booking';
import { createBlockCore, deleteBlockCore } from '../lib/block';
import { changeBookingStatusCore } from '../lib/booking-status-change';
import { verifyManageToken } from '../lib/tokens';
import { minutesOfDayInZone, zonedWallTimeToUtc } from '../lib/time';
import { bookingInput, createFixture, type Fixture } from './fixtures';

let fx: Fixture;
let ownerId: string;
let staffId: string;
const extraUsers: string[] = [];
const extraBusinesses: string[] = [];

test.beforeEach(async () => {
  fx = await createFixture();
  ownerId = (await db.business.findUniqueOrThrow({ where: { id: fx.businessId } }))
    .ownerId;
  staffId = fx.staffIds[0]!;
});
test.afterEach(async () => {
  await db.auditLog.deleteMany({
    where: { businessId: { in: [fx.businessId, ...extraBusinesses] } },
  });
  await fx.cleanup();
  await db.business.deleteMany({ where: { id: { in: extraBusinesses.splice(0) } } });
  await db.user.deleteMany({ where: { id: { in: extraUsers.splice(0) } } });
});

const manual = (o: Record<string, unknown> = {}) => ({
  serviceId: fx.serviceId,
  staffId,
  date: fx.dateKey,
  time: '10:00',
  name: 'Walk In',
  ...o,
});
const create = (
  o: Record<string, unknown> = {},
  user: string | null = ownerId,
  businessId = fx.businessId,
) => createManualBookingCore(user, businessId, manual(o));
const block = (o: Record<string, unknown> = {}, user: string | null = ownerId) =>
  createBlockCore(user, fx.businessId, {
    staffId,
    dateKey: fx.dateKey,
    startMin: 840,
    endMin: 900,
    ...o,
  });
const at = (min: number) => zonedWallTimeToUtc(fx.dateKey, min).toISOString();

async function otherOwner(withBusiness = false) {
  const tag = randomUUID().slice(0, 8);
  const u = await db.user.create({
    data: { email: `other-${tag}@e2e.test`, name: 'Other Owner', role: 'OWNER' },
  });
  extraUsers.push(u.id);
  let businessId: string | null = null;
  if (withBusiness) {
    const b = await db.business.create({
      data: {
        slug: `e2e-other-${tag}`,
        ownerId: u.id,
        name: 'Other',
        category: 'nails',
        city: 'Larnaca',
        settings: {},
      },
    });
    extraBusinesses.push(b.id);
    businessId = b.id;
  }
  return { id: u.id, businessId };
}

test.describe('manual bookings', () => {
  test('creates a MANUAL booking with reference, manage hash and defaults; overlap is rejected', async () => {
    const r = await create({
      phone: '99 123456',
      email: 'Guest@E2E.test',
      note: 'phone call',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } });
    expect(row.source).toBe('MANUAL');
    expect(row.reference).toMatch(/^SC-[A-Z0-9]{5}$/);
    expect(row.status).toBe('CONFIRMED');
    expect(row.priceCents).toBe(3000); // service price by default
    expect(row.guestPhone).toBe('+35799123456');
    expect(row.guestEmail).toBe('guest@e2e.test');
    expect(row.startsAt.toISOString()).toBe(at(600));
    expect(row.endsAt.toISOString()).toBe(at(660));
    expect(row.manageTokenHash).toBeTruthy();
    expect(
      verifyManageToken(manageTokenFor(row.id, row.endsAt).token, row.manageTokenHash),
    ).toBe(true);
    expect(r.hasContact).toBe(true);

    // Overlapping start (10:30) is rejected; nothing is written.
    const clash = await create({ time: '10:30', name: 'Second' });
    expect(clash).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(await db.booking.count({ where: { businessId: fx.businessId } })).toBe(1);

    // Back-to-back (11:00) is fine; price override is honoured.
    const next = await create({ time: '11:00', priceCents: 1500, name: 'Third' });
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(
        (await db.booking.findUniqueOrThrow({ where: { id: next.bookingId } }))
          .priceCents,
      ).toBe(1500);
    }
  });

  test('walk-in without contact details sends nothing; service buffer counts as overlap', async () => {
    const r = await create();
    expect(r).toMatchObject({ ok: true, hasContact: false });
    await db.service.update({ where: { id: fx.serviceId }, data: { bufferMin: 15 } });
    // A 09:00 booking ends 10:00, but its 15-min buffer (to 10:15) runs into the 10:00 one.
    expect(await create({ time: '09:00' })).toMatchObject({ ok: false, code: 'OVERLAP' });
    // 08:45 ends 09:45 and its buffer ends exactly at 10:00: fits.
    expect(await create({ time: '08:45' })).toMatchObject({ ok: true });
  });

  test('validates input, ownership of service/staff and the past limit', async () => {
    expect(await create({ name: 'A' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      errors: { name: 'nameRequired' },
    });
    expect(await create({ email: 'nope' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      errors: { email: 'emailInvalid' },
    });
    expect(await create({ date: '2020-01-01' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      errors: { date: 'tooFarInPast' },
    });
    const foreign = await otherOwner(true);
    const foreignStaff = await db.staffMember.create({
      data: { businessId: foreign.businessId!, name: 'X' },
    });
    expect(await create({ staffId: foreignStaff.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(await db.booking.count({ where: { businessId: fx.businessId } })).toBe(0);
  });

  test('a double submit with the same key creates one booking', async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => create({ idempotencyKey: key })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => (r.ok ? r.bookingId : ''))).size).toBe(1);
    expect(results.filter((r) => r.ok && r.created)).toHaveLength(1);
    expect(await db.booking.count({ where: { businessId: fx.businessId } })).toBe(1);
  });

  test('parallel manual + online bookings for one slot: exactly one wins', async () => {
    const tasks: Array<Promise<boolean>> = [
      ...Array.from({ length: 5 }, (_, i) =>
        create({ name: `Walk ${i}` }).then((r) => r.ok),
      ),
      ...Array.from({ length: 4 }, () =>
        createBookingRecord({ input: bookingInput(fx, { staffId }) }).then((r) => r.ok),
      ),
    ];
    const wins = (await Promise.all(tasks)).filter(Boolean);
    expect(wins).toHaveLength(1);
    expect(await db.booking.count({ where: { businessId: fx.businessId } })).toBe(1);
  });
});

test.describe('blocks', () => {
  test('a block over a booking is rejected with a conflict count; a block elsewhere works and holds the slot', async () => {
    await create(); // 10:00-11:00
    const over = await block({ startMin: 630, endMin: 690 });
    expect(over).toMatchObject({
      ok: false,
      code: 'OVERLAP',
      conflictCount: 1,
      conflictDates: [fx.dateKey],
    });
    expect(await db.block.count({ where: { businessId: fx.businessId } })).toBe(0);

    const elsewhere = await block({ startMin: 840, endMin: 900, reason: 'Lunch' });
    expect(elsewhere).toMatchObject({ ok: true, created: 1 });

    // Online booking at 14:00 (inside the block) is refused.
    const online = await createBookingRecord({
      input: bookingInput(fx, { staffId, startsAt: at(840) }),
    });
    expect(online).toMatchObject({ ok: false, code: 'SLOT_TAKEN' });
    // A manual booking there is refused too, and an overlapping second block (block-vs-block).
    expect(await create({ time: '14:30' })).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(await block({ startMin: 870, endMin: 930 })).toMatchObject({
      ok: false,
      code: 'OVERLAP',
    });
  });

  test('"all staff" blocks every active team member in one all-or-nothing write', async () => {
    const second = await db.staffMember.create({
      data: { businessId: fx.businessId, name: 'Second' },
    });
    await db.staffService.create({
      data: { staffId: second.id, serviceId: fx.serviceId },
    });
    // A booking for the SECOND person makes the whole request fail and write nothing.
    await create({ staffId: second.id, time: '14:00' });
    const rejected = await block({ staffId: 'all' });
    expect(rejected).toMatchObject({ ok: false, code: 'OVERLAP' });
    expect(await db.block.count({ where: { businessId: fx.businessId } })).toBe(0);

    const ok = await block({ staffId: 'all', startMin: 1000, endMin: 1060 });
    expect(ok).toMatchObject({ ok: true, created: 2 });
  });

  test('block vs booking race on the same slot: exactly one wins (4.3 carry-over lock)', async () => {
    for (const [i, hour] of [9, 11, 12, 13, 15].entries()) {
      const startMin = hour * 60;
      const results = await Promise.all([
        block({ startMin, endMin: startMin + 60 }).then((r) => r.ok),
        create({ time: `${String(hour).padStart(2, '0')}:00` }).then((r) => r.ok),
        createBookingRecord({
          input: bookingInput(fx, { staffId, startsAt: at(startMin) }),
        }).then((r) => r.ok),
      ]);
      expect(results.filter(Boolean), `round ${i}`).toHaveLength(1);
      const from = new Date(at(startMin));
      const to = new Date(at(startMin + 60));
      const [bookings, blocks] = await Promise.all([
        db.booking.count({
          where: {
            businessId: fx.businessId,
            startsAt: { lt: to },
            endsAt: { gt: from },
          },
        }),
        db.block.count({
          where: {
            businessId: fx.businessId,
            startsAt: { lt: to },
            endsAt: { gt: from },
          },
        }),
      ]);
      expect(bookings + blocks, `round ${i}`).toBe(1);
    }
  });

  test('a weekly block across the spring DST change keeps its local start time', async () => {
    const r = await createBlockCore(ownerId, fx.businessId, {
      staffId,
      dateKey: '2026-03-23',
      startMin: 780,
      endMin: 840,
      recurrence: 'weekly',
      untilKey: '2026-04-06',
    });
    expect(r).toMatchObject({ ok: true, created: 3 });
    const rows = await db.block.findMany({
      where: { businessId: fx.businessId },
      orderBy: { startsAt: 'asc' },
    });
    expect(rows.map((b) => minutesOfDayInZone(b.startsAt))).toEqual([780, 780, 780]);
    expect(rows.map((b) => b.startsAt.toISOString())).toEqual([
      '2026-03-23T11:00:00.000Z',
      '2026-03-30T10:00:00.000Z',
      '2026-04-06T10:00:00.000Z',
    ]);
  });

  test('rejects over-long series and invalid times without writing', async () => {
    expect(await block({ recurrence: 'daily', untilKey: '2027-12-31' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      errors: { form: 'untilTooFar' },
    });
    expect(await block({ startMin: 900, endMin: 840 })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      errors: { form: 'invalidTimes' },
    });
    expect(await db.block.count({ where: { businessId: fx.businessId } })).toBe(0);
  });

  test('deleting a block frees the slot', async () => {
    await block();
    const row = await db.block.findFirstOrThrow({ where: { businessId: fx.businessId } });
    expect(await deleteBlockCore(ownerId, fx.businessId, row.id)).toMatchObject({
      ok: true,
    });
    expect(await db.block.count({ where: { businessId: fx.businessId } })).toBe(0);
    const online = await createBookingRecord({
      input: bookingInput(fx, { staffId, startsAt: at(840) }),
    });
    expect(online.ok).toBe(true);
    expect(await deleteBlockCore(ownerId, fx.businessId, row.id)).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });
});

test.describe('authorisation', () => {
  test('another owner cannot create, delete or change anything in this business, and nothing changes', async () => {
    const booked = await create();
    expect(booked.ok).toBe(true);
    await block({ startMin: 1000, endMin: 1060 });
    const blockRow = await db.block.findFirstOrThrow({
      where: { businessId: fx.businessId },
    });
    const bookingId = booked.ok ? booked.bookingId : '';
    const before = {
      bookings: await db.booking.count({ where: { businessId: fx.businessId } }),
      blocks: 1,
    };

    for (const intruder of [(await otherOwner()).id, (await otherOwner(true)).id, null]) {
      const code = intruder ? 'FORBIDDEN' : 'UNAUTHENTICATED';
      expect(await create({ time: '15:00' }, intruder)).toMatchObject({
        ok: false,
        code,
      });
      expect(await block({ startMin: 1100, endMin: 1130 }, intruder)).toMatchObject({
        ok: false,
        code,
      });
      expect(await deleteBlockCore(intruder, fx.businessId, blockRow.id)).toMatchObject({
        ok: false,
        code,
      });
      expect(
        await changeBookingStatusCore(
          intruder,
          fx.businessId,
          bookingId,
          'CANCELLED_BY_BUSINESS',
        ),
      ).toMatchObject({ ok: false, code });
    }
    expect(await db.booking.count({ where: { businessId: fx.businessId } })).toBe(
      before.bookings,
    );
    expect(await db.block.count({ where: { businessId: fx.businessId } })).toBe(
      before.blocks,
    );
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status,
    ).toBe('CONFIRMED');
  });

  test("an owner cannot reach another business's rows through their own business id", async () => {
    await block();
    const blockRow = await db.block.findFirstOrThrow({
      where: { businessId: fx.businessId },
    });
    const booked = await create({ time: '11:00' });
    const bookingId = booked.ok ? booked.bookingId : '';
    const intruder = await otherOwner(true);
    expect(
      await deleteBlockCore(intruder.id, intruder.businessId!, blockRow.id),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(
      await changeBookingStatusCore(
        intruder.id,
        intruder.businessId!,
        bookingId,
        'CANCELLED_BY_BUSINESS',
      ),
    ).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(await db.block.count({ where: { id: blockRow.id } })).toBe(1);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status,
    ).toBe('CONFIRMED');
  });
});

test.describe('status changes', () => {
  test('enforces the transition table and the "after start" rule; cancelling frees the slot', async () => {
    const r = await create({ email: 'cust@e2e.test' });
    if (!r.ok) throw new Error('setup');
    const start = new Date(at(600));
    const status = (to: string, now?: Date) =>
      changeBookingStatusCore(ownerId, fx.businessId, r.bookingId, to, now);

    expect(await status('COMPLETED', new Date(start.getTime() - 60_000))).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
      reason: 'NOT_STARTED',
    });
    expect(await status('NO_SHOW', new Date(start.getTime() - 60_000))).toMatchObject({
      ok: false,
      reason: 'NOT_STARTED',
    });
    expect(await status('PENDING')).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
      reason: 'INVALID_TRANSITION',
    });
    expect(await status('NOPE')).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status,
    ).toBe('CONFIRMED');

    // Slot is held while active ...
    expect((await createBookingRecord({ input: bookingInput(fx, { staffId }) })).ok).toBe(
      false,
    );
    // ... cancel (customer has an email, so a notice is due) ...
    expect(await status('CANCELLED_BY_BUSINESS')).toMatchObject({
      ok: true,
      notifyCancelled: true,
    });
    const row = await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } });
    expect(row.status).toBe('CANCELLED_BY_BUSINESS');
    expect(row.cancelledAt).not.toBeNull();
    // ... terminal ...
    expect(await status('CONFIRMED')).toMatchObject({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
    // ... and the slot is free for a new online booking.
    expect((await createBookingRecord({ input: bookingInput(fx, { staffId }) })).ok).toBe(
      true,
    );
  });

  test('completes after the start, confirms pending bookings, walk-ins have no notice', async () => {
    const done = await create({ time: '11:00' });
    if (!done.ok) throw new Error('setup');
    const after = new Date(new Date(at(660)).getTime() + 60_000);
    expect(
      await changeBookingStatusCore(
        ownerId,
        fx.businessId,
        done.bookingId,
        'COMPLETED',
        after,
      ),
    ).toMatchObject({ ok: true, notifyCancelled: false });

    const pending = await create({ time: '13:00', status: 'PENDING', phone: '99123456' });
    if (!pending.ok) throw new Error('setup');
    expect(
      await changeBookingStatusCore(
        ownerId,
        fx.businessId,
        pending.bookingId,
        'CONFIRMED',
      ),
    ).toMatchObject({ ok: true });
    // MANUAL bookings are email-only: a phone-only walk-in cancelled gets no notice.
    expect(
      await changeBookingStatusCore(
        ownerId,
        fx.businessId,
        pending.bookingId,
        'CANCELLED_BY_BUSINESS',
      ),
    ).toMatchObject({
      ok: true,
      notifyCancelled: false,
    });
  });
});

test.describe('audit log', () => {
  test('every change writes an audit row holding ids only (no PII)', async () => {
    const r = await create({
      name: 'ZZPII Name',
      email: 'zzpii@e2e.test',
      phone: '99765432',
      note: 'ZZPII note',
    });
    if (!r.ok) throw new Error('setup');
    await block({ reason: 'ZZPII reason' });
    const blockRow = await db.block.findFirstOrThrow({
      where: { businessId: fx.businessId },
    });
    await deleteBlockCore(ownerId, fx.businessId, blockRow.id);
    await changeBookingStatusCore(
      ownerId,
      fx.businessId,
      r.bookingId,
      'CANCELLED_BY_BUSINESS',
    );

    const rows = await db.auditLog.findMany({
      where: { businessId: fx.businessId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((a) => a.action)).toEqual([
      'booking.manual-create',
      'block.create',
      'block.delete',
      'booking.status',
    ]);
    expect(rows.every((a) => a.actorId === ownerId)).toBe(true);
    const dump = JSON.stringify(rows.map((a) => a.meta));
    for (const pii of ['ZZPII', 'zzpii', '765432']) expect(dump).not.toContain(pii);
    expect(rows[0]!.meta).toEqual({ bookingId: r.bookingId });
    expect(rows[3]!.meta).toEqual({
      bookingId: r.bookingId,
      from: 'CONFIRMED',
      to: 'CANCELLED_BY_BUSINESS',
    });
  });
});
