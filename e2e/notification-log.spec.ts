/**
 * DB-backed tests for the NotificationLog and provider status webhooks (task 5.4,
 * req 6). Real Postgres, no HTTP: the signed handler functions behind the route
 * handlers are called directly (the routes are thin wrappers).
 */
import { test, expect } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { manageTokenFor } from '../lib/booking';
import { recordNotification } from '../lib/notify/log';
import { handleResendWebhook, handleTwilioWebhook } from '../lib/notify/webhooks';
import { createFixture, randomPhone, type Fixture } from './fixtures';

const SECRET = `whsec_${Buffer.from('e2e-webhook-secret').toString('base64')}`;
const TWILIO_TOKEN = 'e2e_twilio_token';
const TWILIO_URL = 'https://she.cy/api/webhooks/twilio';

async function makeBooking(fx: Fixture) {
  const id = randomUUID();
  const startsAt = new Date(Date.now() + 48 * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + 3_600_000);
  return db.booking.create({
    data: {
      id,
      reference: `SC-${randomUUID().slice(0, 5).toUpperCase()}`,
      businessId: fx.businessId,
      serviceId: fx.serviceId,
      staffId: fx.staffIds[0]!,
      guestName: 'E2E Customer',
      guestEmail: `customer-${id.slice(0, 8)}@e2e.test`,
      guestPhone: randomPhone(),
      startsAt,
      endsAt,
      status: 'CONFIRMED',
      priceCents: 3000,
      manageTokenHash: manageTokenFor(id, endsAt).hash,
    },
  });
}

function resend(type: string, emailId: string) {
  const rawBody = JSON.stringify({ type, data: { email_id: emailId } });
  const id = `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(SECRET.slice('whsec_'.length), 'base64');
  const signature = `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')}`;
  return handleResendWebhook({ rawBody, headers: { id, timestamp, signature }, secret: SECRET });
}

function twilio(sid: string, status: string) {
  const params: Record<string, string> = { MessageSid: sid, MessageStatus: status };
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], TWILIO_URL);
  const signature = createHmac('sha1', TWILIO_TOKEN).update(data).digest('base64');
  return handleTwilioWebhook({
    rawBody: new URLSearchParams(params).toString(),
    signature,
    url: TWILIO_URL,
    authToken: TWILIO_TOKEN,
  });
}

test.describe('NotificationLog + webhooks', () => {
  let fx: Fixture;

  test.afterEach(async () => {
    await fx?.cleanup();
    fx = undefined as unknown as Fixture; // not every test creates a fixture
  });

  test('recordNotification stores channel/template/status/providerId and nothing else', async () => {
    fx = await createFixture(1);
    const b = await makeBooking(fx);
    await recordNotification({ bookingId: b.id, template: 'booking-confirmed', result: { ok: true, channel: 'EMAIL', providerId: 'em_ok' } });
    await recordNotification({ bookingId: b.id, template: 'booking-cancelled:business', result: { ok: false, channel: 'SMS', code: 'PROVIDER_ERROR' } });

    const rows = await db.notificationLog.findMany({ where: { bookingId: b.id }, orderBy: { channel: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ channel: 'EMAIL', template: 'booking-confirmed', status: 'SENT', providerId: 'em_ok' });
    expect(rows[1]).toMatchObject({ channel: 'SMS', template: 'booking-cancelled:business', status: 'PROVIDER_ERROR', providerId: null });
    expect(Object.keys(rows[0]!).sort()).toEqual(['bookingId', 'channel', 'id', 'providerId', 'sentAt', 'status', 'template']);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(b.guestEmail!);
    expect(dump).not.toContain(b.guestPhone!);
  });

  test('recordNotification swallows DB errors (unknown booking id)', async () => {
    await expect(
      recordNotification({ bookingId: 'does-not-exist', template: 't', result: { ok: true, channel: 'EMAIL', providerId: 'x' } }),
    ).resolves.toBeUndefined();
  });

  test('Resend: delivered advances SENT; a late sent does not regress; bounce/complaint outrank', async () => {
    fx = await createFixture(1);
    const b = await makeBooking(fx);
    const emailId = `em_${randomUUID()}`;
    await recordNotification({ bookingId: b.id, template: 'booking-confirmed', result: { ok: true, channel: 'EMAIL', providerId: emailId } });
    const status = async () => (await db.notificationLog.findFirstOrThrow({ where: { providerId: emailId } })).status;

    expect((await resend('email.delivered', emailId)).status).toBe(200);
    expect(await status()).toBe('DELIVERED');
    await resend('email.sent', emailId);
    expect(await status()).toBe('DELIVERED');
    await resend('email.opened', emailId); // ignored
    expect(await status()).toBe('DELIVERED');
    await resend('email.complained', emailId);
    expect(await status()).toBe('COMPLAINED');
    await resend('email.delivered', emailId);
    expect(await status()).toBe('COMPLAINED');
  });

  test('Twilio: delivered then late sent keeps DELIVERED; undelivered is recorded', async () => {
    fx = await createFixture(1);
    const b = await makeBooking(fx);
    const sid = `SM${randomUUID().replace(/-/g, '')}`;
    await recordNotification({ bookingId: b.id, template: 'reminder-24h', result: { ok: true, channel: 'WHATSAPP', providerId: sid } });
    const status = async () => (await db.notificationLog.findFirstOrThrow({ where: { providerId: sid } })).status;

    expect((await twilio(sid, 'delivered')).status).toBe(200);
    expect(await status()).toBe('DELIVERED');
    await twilio(sid, 'sent');
    expect(await status()).toBe('DELIVERED');
    await twilio(sid, 'read');
    expect(await status()).toBe('READ');
    await twilio(sid, 'undelivered');
    expect(await status()).toBe('UNDELIVERED');
  });

  test('unknown ids and bad signatures change nothing', async () => {
    fx = await createFixture(1);
    const b = await makeBooking(fx);
    const emailId = `em_${randomUUID()}`;
    await recordNotification({ bookingId: b.id, template: 'booking-confirmed', result: { ok: true, channel: 'EMAIL', providerId: emailId } });

    expect((await resend('email.delivered', 'em_unknown')).status).toBe(200);
    expect((await twilio('SMunknown', 'delivered')).status).toBe(200);
    const forged = await handleResendWebhook({
      rawBody: JSON.stringify({ type: 'email.delivered', data: { email_id: emailId } }),
      headers: { id: 'msg_x', timestamp: String(Math.floor(Date.now() / 1000)), signature: 'v1,AAAA' },
      secret: SECRET,
    });
    expect(forged.status).toBe(403);
    expect((await db.notificationLog.findFirstOrThrow({ where: { providerId: emailId } })).status).toBe('SENT');
  });

  test('log rows are removed when their booking is deleted', async () => {
    fx = await createFixture(1);
    const b = await makeBooking(fx);
    await recordNotification({ bookingId: b.id, template: 'booking-confirmed', result: { ok: true, channel: 'EMAIL', providerId: 'em_cascade' } });
    await db.booking.delete({ where: { id: b.id } });
    expect(await db.notificationLog.count({ where: { bookingId: b.id } })).toBe(0);
  });
});
