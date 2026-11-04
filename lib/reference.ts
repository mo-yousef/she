import { randomInt } from 'node:crypto';

/**
 * Booking reference 'SC-XXXXX' using an unambiguous alphabet (no 0/O/1/I).
 * Short, human-readable, printed on confirmations. Uniqueness is enforced by a
 * unique column; the caller retries on the rare collision.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReference(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `SC-${code}`;
}
