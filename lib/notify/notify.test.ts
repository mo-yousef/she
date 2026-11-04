import { describe, expect, it, vi } from 'vitest';
import { sendWithFallback } from './fallback';
import { createResendEmail, mapResendError } from './resend';
import { devEmail, devPhone, notifierModes } from './select';
import { createTwilioPhone, mapTwilioError } from './twilio';
import type { PhoneMessage, PhoneProvider, SendResult } from './types';

const msg: PhoneMessage = { to: '+35799123456', body: 'hi', locale: 'el', template: 'reminder-24h' };
const ok = (channel: 'WHATSAPP' | 'SMS'): SendResult => ({ ok: true, channel, providerId: 'id1' });
const fail = (channel: 'WHATSAPP' | 'SMS', code: 'PROVIDER_ERROR' | 'INVALID_RECIPIENT'): SendResult => ({
  ok: false,
  channel,
  code,
});

describe('notifierModes', () => {
  const keys = {
    RESEND_API_KEY: 'r',
    TWILIO_ACCOUNT_SID: 's',
    TWILIO_AUTH_TOKEN: 't',
    TWILIO_WHATSAPP_FROM: 'w',
    TWILIO_SMS_FROM: 'p',
  };
  it('is dev under NODE_ENV=test even with keys', () => {
    expect(notifierModes({ NODE_ENV: 'test', ...keys })).toEqual({ email: 'dev', phone: 'dev' });
  });
  it('is dev without keys, live with keys', () => {
    expect(notifierModes({ NODE_ENV: 'production' })).toEqual({ email: 'dev', phone: 'dev' });
    expect(notifierModes({ NODE_ENV: 'production', ...keys })).toEqual({ email: 'live', phone: 'live' });
  });
  it('treats partial Twilio config as dev', () => {
    expect(notifierModes({ ...keys, TWILIO_SMS_FROM: '' }).phone).toBe('dev');
  });
});

describe('dev notifier', () => {
  it('skips with NOT_CONFIGURED and logs no recipient', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await devPhone().sendWhatsApp(msg);
    expect(r).toEqual({ ok: false, channel: 'WHATSAPP', code: 'NOT_CONFIGURED' });
    const e = await devEmail().sendEmail({
      to: 'a@b.cy', subject: 'secret subject', html: '', text: '', locale: 'en', template: 'confirm',
    });
    expect(e.ok).toBe(false);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('template=reminder-24h');
    expect(logged).not.toMatch(/35799123456|a@b\.cy|secret subject/);
    warn.mockRestore();
  });
});

describe('sendWithFallback', () => {
  const provider = (wa: SendResult, sms: SendResult): PhoneProvider & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      sendWhatsApp: async () => (calls.push('wa'), wa),
      sendSms: async () => (calls.push('sms'), sms),
    };
  };
  it('does not use SMS when WhatsApp succeeds', async () => {
    const p = provider(ok('WHATSAPP'), ok('SMS'));
    expect(await sendWithFallback(p, msg)).toEqual(ok('WHATSAPP'));
    expect(p.calls).toEqual(['wa']);
  });
  it('falls back to SMS when WhatsApp fails', async () => {
    const p = provider(fail('WHATSAPP', 'PROVIDER_ERROR'), ok('SMS'));
    expect(await sendWithFallback(p, msg)).toEqual(ok('SMS'));
    expect(p.calls).toEqual(['wa', 'sms']);
  });
  it('does not fall back for an invalid recipient', async () => {
    const p = provider(fail('WHATSAPP', 'INVALID_RECIPIENT'), ok('SMS'));
    expect((await sendWithFallback(p, msg)).ok).toBe(false);
    expect(p.calls).toEqual(['wa']);
  });
  it('returns the SMS failure when both fail', async () => {
    const p = provider(fail('WHATSAPP', 'PROVIDER_ERROR'), fail('SMS', 'PROVIDER_ERROR'));
    expect(await sendWithFallback(p, msg)).toEqual(fail('SMS', 'PROVIDER_ERROR'));
  });
});

describe('Twilio adapter', () => {
  const from = { whatsapp: '+14155238886', sms: '+357000' };
  it('prefixes whatsapp: and returns the sid', async () => {
    const create = vi.fn().mockResolvedValue({ sid: 'SM1' });
    const r = await createTwilioPhone({ messages: { create } }, from).sendWhatsApp(msg);
    expect(r).toEqual({ ok: true, channel: 'WHATSAPP', providerId: 'SM1' });
    expect(create).toHaveBeenCalledWith({ from: 'whatsapp:+14155238886', to: 'whatsapp:+35799123456', body: 'hi' });
  });
  it('maps thrown errors to codes without leaking the message', async () => {
    const create = vi.fn().mockRejectedValue({ code: 21211, message: 'bad +35799123456' });
    const r = await createTwilioPhone({ messages: { create } }, from).sendSms(msg);
    expect(r).toEqual({ ok: false, channel: 'SMS', code: 'INVALID_RECIPIENT' });
  });
  it('maps rate limits and unknowns', () => {
    expect(mapTwilioError({ status: 429 })).toBe('RATE_LIMITED');
    expect(mapTwilioError(new Error('x'))).toBe('PROVIDER_ERROR');
  });
});

describe('Resend adapter', () => {
  const email = { to: 'a@b.cy', subject: 's', html: '<p>x</p>', text: 'x', locale: 'en' as const, template: 'confirm' };
  it('returns the provider id on success', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'em1' }, error: null });
    const r = await createResendEmail({ emails: { send } }, 'from@she.cy').sendEmail(email);
    expect(r).toEqual({ ok: true, channel: 'EMAIL', providerId: 'em1' });
  });
  it('maps SDK error objects', async () => {
    expect(mapResendError({ statusCode: 429 })).toBe('RATE_LIMITED');
    expect(mapResendError({ name: 'validation_error', statusCode: 422 })).toBe('INVALID_RECIPIENT');
    expect(mapResendError({ name: 'application_error', statusCode: 500 })).toBe('PROVIDER_ERROR');
    const send = vi.fn().mockResolvedValue({ data: null, error: { name: 'validation_error', statusCode: 422 } });
    const r = await createResendEmail({ emails: { send } }, 'f').sendEmail(email);
    expect(r).toEqual({ ok: false, channel: 'EMAIL', code: 'INVALID_RECIPIENT' });
  });
  it('maps thrown errors to PROVIDER_ERROR', async () => {
    const send = vi.fn().mockRejectedValue(new Error('ECONNRESET a@b.cy'));
    const r = await createResendEmail({ emails: { send } }, 'f').sendEmail(email);
    expect(r).toEqual({ ok: false, channel: 'EMAIL', code: 'PROVIDER_ERROR' });
  });
});
