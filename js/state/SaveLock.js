/**
 * Locked save files (AES-GCM with a PBKDF2-SHA256 key). Used by Load from File
 * when a file is in the ycitwy-enc envelope. The passphrase is never stored.
 */

export const LOCKED_SAVE_FORMAT = 'ycitwy-enc';
export const LOCKED_SAVE_VERSION = 1;
export const LOCKED_SAVE_ITERATIONS = 200000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;
const MAX_ITERATIONS = 1000000;

/** Trim and lowercase before key derivation. */
export function normalizePassphrase(value) {
  return String(value ?? '').trim().toLowerCase();
}

function bytesToB64(bytes) {
  const arr = new Uint8Array(bytes);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    bin += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64ToBytes(value) {
  const bin = atob(String(value ?? ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function asDocument(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
}

/** True when `value` (JSON text or a parsed object) is a supported locked envelope. */
export function isLockedSave(value) {
  const doc = asDocument(value);
  if (!doc || doc.format !== LOCKED_SAVE_FORMAT) return false;
  if (doc.v !== LOCKED_SAVE_VERSION) return false;
  if (typeof doc.salt !== 'string' || typeof doc.iv !== 'string' || typeof doc.data !== 'string') return false;
  const iter = Number(doc.iter);
  return Number.isFinite(iter) && iter >= 1 && iter <= MAX_ITERATIONS;
}

/** True when the file claims the locked format, including an unsupported version. */
export function isLockedSaveFormat(value) {
  const doc = asDocument(value);
  return !!(doc && doc.format === LOCKED_SAVE_FORMAT);
}

function getCrypto() {
  const c = globalThis.crypto;
  if (!c?.subtle || typeof c.getRandomValues !== 'function') {
    throw new Error('This save cannot be unlocked in this browser.');
  }
  return c;
}

async function deriveKey(passphrase, salt, iter) {
  const crypto = getCrypto();
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizePassphrase(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @param {string} plaintext
 * @param {string} passphrase
 * @returns {Promise<object>} locked envelope
 */
export async function encryptSave(plaintext, passphrase) {
  if (!normalizePassphrase(passphrase)) throw new Error('A passphrase is required.');
  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const iter = LOCKED_SAVE_ITERATIONS;
  const key = await deriveKey(passphrase, salt, iter);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(String(plaintext)),
  );
  return {
    format: LOCKED_SAVE_FORMAT,
    v: LOCKED_SAVE_VERSION,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    iter,
    data: bytesToB64(data),
  };
}

/**
 * Decrypt a locked envelope to the original save text.
 * Throws with `code: 'BAD_PASSPHRASE'` when the passphrase is wrong.
 * @param {string|object} envelope
 * @param {string} passphrase
 * @returns {Promise<string>}
 */
export async function decryptSave(envelope, passphrase) {
  const doc = asDocument(envelope);
  if (doc && doc.format === LOCKED_SAVE_FORMAT && doc.v !== LOCKED_SAVE_VERSION) {
    throw new Error('This locked save uses an unsupported format.');
  }
  if (!isLockedSave(doc)) throw new Error('This save file could not be read.');
  const salt = b64ToBytes(doc.salt);
  const iv = b64ToBytes(doc.iv);
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) {
    throw new Error('This save file could not be read.');
  }
  const iter = Math.floor(Number(doc.iter));
  const key = await deriveKey(passphrase, salt, iter);
  try {
    const plain = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      b64ToBytes(doc.data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    const error = new Error('That passphrase did not work.');
    error.code = 'BAD_PASSPHRASE';
    throw error;
  }
}
