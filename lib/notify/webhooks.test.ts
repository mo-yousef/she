/**
 * Signature verification for the status webhooks. Every case uses an ignorable status
 * (Twilio 'sending', Resend 'email.opened'), so a verified request never reaches the DB.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handleResendWebhook, handleTwilioWebhook, twilioWebhookUrl } from './webhooks';

const TOKEN = 'test_auth_token';
const URL_ = 'https://she.cy/api/webhooks/twilio';

function twilioSig(url: string, params: Record<string, string>, token = TOKEN) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac('sha1', token).update(data).digest('base64');
}

describe('handleTwilioWebhook', () => {
  const params = { MessageSid: 'SM123abc', MessageStatus: 'sending', To: 'whatsapp:+35799000000' };
  const body = new URLSearchParams(params).toString();
  const call = (o: Partial<Parameters<typeof handleTwilioWebhook>[0]> = {}) =>
    handleTwilioWebhook({
      rawBody: body,
      signature: twilioSig(URL_, params),
      url: URL_,
      authToken: TOKEN,
      ...o,
    });

  it('accepts a valid signature', async () => {
    expect((await call()).status).toBe(200);
  });
  it('rejects a missing header, wrong token, wrong URL, tampered param', async () => {
    expect((await call({ signature: null })).status).toBe(403);
    expect((await call({ authToken: 'other' })).status).toBe(403);
    expect((await call({ url: 'https://evil.example/api/webhooks/twilio' })).status).toBe(403);
    expect((await call({ rawBody: body.replace('sending', 'delivered') })).status).toBe(403);
  });
  it('fails closed when the auth token or URL is unset', async () => {
    expect((await call({ authToken: undefined })).status).toBe(403);
    expect((await call({ authToken: '' })).status).toBe(403);
    expect((await call({ url: null })).status).toBe(403);
  });
  it('rejects a correctly signed but malformed payload with 400', async () => {
    const bad = { MessageStatus: 'sent' };
    const res = await call({ rawBody: new URLSearchParams(bad).toString(), signature: twilioSig(URL_, bad) });
    expect(res.status).toBe(400);
  });
});

describe('twilioWebhookUrl', () => {
  it('builds the public URL from the site URL', () => {
    expect(twilioWebhookUrl('https://she.cy/')).toBe(URL_);
    expect(twilioWebhookUrl('')).toBeNull();
  });
});

describe('handleResendWebhook', () => {
  const SECRET = `whsec_${Buffer.from('super-secret-key-bytes').toString('base64')}`;
  const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'em_1' } });
  const nowSec = () => Math.floor(Date.now() / 1000);

  function sign(id: string, ts: string, payload: string, secret = SECRET) {
    const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
    return `v1,${createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest('base64')}`;
  }
  const call = (o: { ts?: string; signature?: string | null; secret?: string | undefined; rawBody?: string } = {}) => {
    const ts = o.ts ?? String(nowSec());
    const rawBody = o.rawBody ?? body;
    return handleResendWebhook({
      rawBody,
      headers: {
        id: 'msg_1',
        timestamp: ts,
        signature: o.signature === undefined ? sign('msg_1', ts, body) : o.signature,
      },
      secret: 'secret' in o ? o.secret : SECRET,
    });
  };

  it('accepts a valid signature', async () => {
    expect((await call()).status).toBe(200);
  });
  it('accepts when one of several space-separated signatures matches', async () => {
    const ts = String(nowSec());
    const sig = `v1,AAAA ${sign('msg_1', ts, body)}`;
    expect((await call({ ts, signature: sig })).status).toBe(200);
  });
  it('rejects wrong secret, tampered body, stale timestamp, malformed or missing signature', async () => {
    const other = `whsec_${Buffer.from('another-key').toString('base64')}`;
    const ts = String(nowSec());
    expect((await call({ signature: sign('msg_1', ts, body, other), ts })).status).toBe(403);
    expect((await call({ rawBody: body.replace('em_1', 'em_2') })).status).toBe(403);
    const old = String(nowSec() - 10 * 60);
    expect((await call({ ts: old, signature: sign('msg_1', old, body) })).status).toBe(403);
    expect((await call({ signature: 'not-a-signature' })).status).toBe(403);
    expect((await call({ signature: null })).status).toBe(403);
  });
  it('fails closed when the secret is unset', async () => {
    expect((await call({ secret: undefined })).status).toBe(403);
    expect((await call({ secret: '' })).status).toBe(403);
  });
  it('rejects a correctly signed non-JSON body (the SDK parses during verify)', async () => {
    const ts = String(nowSec());
    const raw = 'not json';
    expect((await call({ ts, rawBody: raw, signature: sign('msg_1', ts, raw) })).status).toBe(403);
  });
  it('rejects a correctly signed payload with the wrong shape with 400', async () => {
    const ts = String(nowSec());
    const raw = JSON.stringify({ type: 'email.sent', data: {} });
    expect((await call({ ts, rawBody: raw, signature: sign('msg_1', ts, raw) })).status).toBe(400);
  });
});
