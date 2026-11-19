import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS, canSend, checkCode, generateCode, hashCode, otpEmailHtml } from './otp.js';

test('OTP : 6 chiffres, valable 30 min, 5 essais, anti-abus', () => {
  const now = 1_000_000;
  for (let i = 0; i < 50; i++) assert.match(generateCode(), /^\d{6}$/);
  const code = '042731';
  const doc = { hash: hashCode('u1', code), expiresAt: now + OTP_TTL_MS, attempts: 0 };
  assert.deepEqual(checkCode(doc, 'u1', code, now), { ok: true });
  assert.deepEqual(checkCode(doc, 'u1', ' 042731 ', now + OTP_TTL_MS - 1), { ok: true });
  assert.equal(checkCode(doc, 'u2', code, now).ok, false); // le code est lié au compte
  assert.deepEqual(checkCode(doc, 'u1', '111111', now), { ok: false, reason: 'wrong', attempts: 1 });
  assert.equal(checkCode(doc, 'u1', code, now + OTP_TTL_MS + 1).reason, 'expired'); // inactif après 30 min
  assert.equal(checkCode({ ...doc, attempts: OTP_MAX_ATTEMPTS }, 'u1', code, now).reason, 'locked');
  assert.equal(checkCode(null, 'u1', code, now).reason, 'no-code');
  assert.equal(canSend(null, now).ok, true);
  assert.equal(canSend({ sentAt: now - 10_000, history: [now - 10_000] }, now).reason, 'too-soon');
  assert.equal(canSend({ sentAt: now - 120_000, history: Array(6).fill(now - 120_000) }, now).reason, 'too-many');
  assert.match(otpEmailHtml('123456', '<b>Ali</b>'), /bAli\/b/);
});
