import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

const AES_ALGO = 'aes-256-gcm';

// ── AES-256-GCM: encrypt / decrypt the Subsonic plaintext password ────────────

export function encryptPassword(plaintext: string, secret: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(AES_ALGO, secret, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: 12 bytes iv | 16 bytes authTag | n bytes ciphertext → base64
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptPassword(encoded: string, secret: Buffer): string {
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(AES_ALGO, secret, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// ── Scrypt: hash / verify for the future custom-API login ────────────────────

const SCRYPT_N = 16384;
const SCRYPT_KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEY_LEN, { N: SCRYPT_N }).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const computed = scryptSync(password, salt, SCRYPT_KEY_LEN, { N: SCRYPT_N });
  return timingSafeEqual(Buffer.from(hash, 'hex'), computed);
}

// ── Subsonic token: md5(password + salt) ─────────────────────────────────────

export function checkSubsonicToken(plainPassword: string, token: string, salt: string): boolean {
  const expected = createHash('md5').update(plainPassword + salt).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

// ── API key helpers ───────────────────────────────────────────────────────────

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}
