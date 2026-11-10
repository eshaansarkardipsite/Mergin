import crypto from 'node:crypto';
import { config } from '../config';
import {
  createUserForIdentity,
  findUserByEmail,
  getSessionUser,
  linkUserIdentity,
} from '../db/repo';
import type { IdentityProfile } from '../db/repo';
import {
  createPasskeyCredential,
  findPasskeyCredential,
  listPasskeyCredentials,
  updatePasskeyCounter,
} from '../db/repo';
import type { SessionUser } from '../../shared/types';

export class PasskeyError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const CHALLENGE_TTL_SECONDS = 60 * 5;
const RP_ID = config.appBaseUrl.replace(/^https?:\/\//, '').split(':')[0];
const RP_NAME = 'MERGIN';

/** In-memory challenge store. Single-process; scale to Redis for multiple instances. */
const challenges = new Map<string, { type: 'register' | 'authenticate'; userId?: string; exp: number }>();

function cleanChallenges(): void {
  const now = Date.now();
  for (const [key, value] of challenges.entries()) {
    if (value.exp * 1000 < now) challenges.delete(key);
  }
}

setInterval(cleanChallenges, 60_000);

function setChallenge(token: string, type: 'register' | 'authenticate', userId?: string): void {
  challenges.set(token, { type, userId, exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS });
}

function getChallenge(token: string): { type: 'register' | 'authenticate'; userId?: string; exp: number } | null {
  cleanChallenges();
  const value = challenges.get(token);
  if (!value || value.exp * 1000 < Date.now()) {
    challenges.delete(token);
    return null;
  }
  return value;
}

function base64urlEncode(buffer: ArrayBuffer | Buffer): string {
  return Buffer.from(buffer as Buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------- minimal CBOR decoder (RFC 8949) ----------

type CborValue = number | string | Buffer | boolean | null | CborValue[] | { [key: string | number]: CborValue };

function decodeCbor(buffer: Buffer, offset = 0): { value: CborValue; nextOffset: number } {
  const byte = buffer[offset];
  const major = byte >> 5;
  const minor = byte & 0x1f;
  let val: CborValue = null;
  let pos = offset + 1;

  function readAdditional(): number {
    if (minor < 24) return minor;
    if (minor === 24) return buffer[pos++];
    if (minor === 25) return buffer.readUInt8(pos++);
    if (minor === 26) return buffer.readUInt16BE(pos++);
    if (minor === 27) return buffer.readUInt32BE(pos++);
    throw new PasskeyError('Unsupported CBOR additional info', 400);
  }

  const additional = readAdditional();

  switch (major) {
    case 0: // unsigned int
      val = additional;
      break;
    case 1: // negative int
      val = -1 - additional;
      break;
    case 2: // byte string
      val = Buffer.from(buffer.subarray(pos, pos + additional));
      pos += additional;
      break;
    case 3: // text string
      val = buffer.subarray(pos, pos + additional).toString('utf8');
      pos += additional;
      break;
    case 4: // array
      val = [];
      for (let i = 0; i < additional; i++) {
        const item = decodeCbor(buffer, pos);
        (val as CborValue[]).push(item.value);
        pos = item.nextOffset;
      }
      break;
    case 5: // map
      val = {};
      for (let i = 0; i < additional; i++) {
        const key = decodeCbor(buffer, pos);
        pos = key.nextOffset;
        const value = decodeCbor(buffer, pos);
        pos = value.nextOffset;
        (val as { [key: string | number]: CborValue })[String(key.value)] = value.value;
      }
      break;
    case 7:
      if (additional === 20 || additional === 23) {
        val = null;
      } else if (additional === 21) {
        val = false;
      } else if (additional === 22) {
        val = true;
      } else {
        throw new PasskeyError('Unsupported CBOR simple value', 400);
      }
      break;
    default:
      throw new PasskeyError('Unsupported CBOR major type', 400);
  }

  return { value: val, nextOffset: pos };
}

// ---------- COSE key parsing (EC2 P-256 only) ----------

interface Ec2PublicKey {
  kty: number;
  alg: number;
  crv: number;
  x: Buffer;
  y: Buffer;
}

function decodeCoseKey(coseKey: Buffer): Ec2PublicKey {
  const decoded = decodeCbor(coseKey);
  const map = decoded.value as { [key: string | number]: CborValue };
  const kty = Number(map[1]);
  const alg = Number(map[3]);
  const crv = Number(map[-1]);
  const x = map[-2] as Buffer;
  const y = map[-3] as Buffer;
  if (kty !== 2 || alg !== -7 || crv !== 1 || !(x instanceof Buffer) || !(y instanceof Buffer)) {
    throw new PasskeyError('Only EC2 P-256 ES256 COSE keys are supported', 400);
  }
  return { kty, alg, crv, x: Buffer.from(x), y: Buffer.from(y) };
}

/** Look up or create a local workspace user by email. */
function getOrCreateUser(email: string): SessionUser {
  const existing = findUserByEmail(email);
  if (existing) {
    const user = getSessionUser(existing.id);
    if (user) return user;
  }
  const profile: IdentityProfile = {
    provider: 'passkey',
    subject: email,
    email,
    name: email.split('@')[0],
  };
  const userId = createUserForIdentity(profile);
  const user = getSessionUser(userId);
  if (user) return user;
  throw new PasskeyError('User not found.', 404);
}

/** Server-side: create the registration challenge payload for the client. */
export function createPasskeyRegisterOptions(email: string): {
  challenge: string;
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
  userDisplay: string;
} {
  const user = getOrCreateUser(email);
  const challenge = crypto.randomBytes(32);
  const challengeToken = base64urlEncode(challenge);
  setChallenge(challengeToken, 'register', user.id);

  return {
    challenge: challengeToken,
    rpId: RP_ID,
    rpName: RP_NAME,
    userId: base64urlEncode(Buffer.from(user.id)),
    userName: user.email,
    userDisplay: user.name,
  };
}

/** Server-side: verify the registration response and store the credential. */
export function verifyPasskeyRegistration(
  challengeToken: string,
  credential: {
    id: string;
    rawId: string;
    response: {
      attestationObject: string;
      clientDataJSON: string;
    };
  },
): SessionUser {
  const challenge = getChallenge(challengeToken);
  if (!challenge || challenge.type !== 'register' || !challenge.userId) {
    throw new PasskeyError('Invalid or expired registration challenge.', 400);
  }

  const clientData = JSON.parse(Buffer.from(credential.response.clientDataJSON, 'base64url').toString('utf8'));
  if (clientData.type !== 'webauthn.create') {
    throw new PasskeyError('Invalid client data type.', 400);
  }
  if (clientData.challenge !== challengeToken) {
    throw new PasskeyError('Challenge mismatch.', 400);
  }
  const allowedOrigins = [`http://${RP_ID}`, `https://${RP_ID}`];
  if (!allowedOrigins.includes(clientData.origin)) {
    throw new PasskeyError('Unexpected origin.', 400);
  }

  const attestation = Buffer.from(credential.response.attestationObject, 'base64url');
  const decoded = decodeCbor(attestation);
  const fmtMap = decoded.value as { [key: string | number]: CborValue };
  const authData = fmtMap.authData as Buffer;

  if (!(authData instanceof Buffer) || authData.length < 37) {
    throw new PasskeyError('Invalid authenticator data.', 400);
  }

  const flags = authData[32];
  if (!(flags & 0x40)) {
    throw new PasskeyError('Attested credential data not present.', 400);
  }

  const credentialIdLength = authData.readUInt16BE(53);
  const credentialId = authData.subarray(55, 55 + credentialIdLength);
  const coseKeyStart = 55 + credentialIdLength;
  const coseKey = authData.subarray(coseKeyStart);

  const publicKey = decodeCoseKey(coseKey);
  const credentialIdBase64 = base64urlEncode(credentialId);

  const existing = findPasskeyCredential(credentialIdBase64);
  if (existing) {
    throw new PasskeyError('This passkey is already registered.', 409);
  }

  const user = getOrCreateUser(challenge.userId);
  createPasskeyCredential(user.id, `Passkey ${credentialIdBase64.slice(0, 8)}`, JSON.stringify(publicKey), credentialIdBase64);

  linkUserIdentity('passkey', user.id, user.id);

  challenges.delete(challengeToken);
  return user;
}

/** Server-side: create the authentication challenge payload for the client. */
export function createPasskeyAuthenticateOptions(email: string): {
  challenge: string;
  rpId: string;
  allowCredentials: Array<{ id: string; type: 'public-key' }>;
} {
  const user = getOrCreateUser(email);
  const credentials = listPasskeyCredentials(user.id);
  if (credentials.length === 0) {
    throw new PasskeyError('No passkeys registered for this account.', 404);
  }

  const challenge = crypto.randomBytes(32);
  const challengeToken = base64urlEncode(challenge);
  setChallenge(challengeToken, 'authenticate', user.id);

  return {
    challenge: challengeToken,
    rpId: RP_ID,
    allowCredentials: credentials.map((c) => ({ id: c.id, type: 'public-key' })),
  };
}

/** Server-side: verify the authentication response and update counter. */
export function verifyPasskeyAuthentication(
  challengeToken: string,
  credential: {
    id: string;
    rawId: string;
    response: {
      authenticatorData: string;
      clientDataJSON: string;
      signature: string;
    };
  },
): SessionUser {
  const challenge = getChallenge(challengeToken);
  if (!challenge || challenge.type !== 'authenticate' || !challenge.userId) {
    throw new PasskeyError('Invalid or expired authentication challenge.', 400);
  }

  const clientData = JSON.parse(Buffer.from(credential.response.clientDataJSON, 'base64url').toString('utf8'));
  if (clientData.type !== 'webauthn.get') {
    throw new PasskeyError('Invalid client data type.', 400);
  }
  if (clientData.challenge !== challengeToken) {
    throw new PasskeyError('Challenge mismatch.', 400);
  }
  const allowedOrigins = [`http://${RP_ID}`, `https://${RP_ID}`];
  if (!allowedOrigins.includes(clientData.origin)) {
    throw new PasskeyError('Unexpected origin.', 400);
  }

  const stored = findPasskeyCredential(credential.id);
  if (!stored) {
    throw new PasskeyError('Unknown passkey credential.', 404);
  }

  const authData = Buffer.from(credential.response.authenticatorData, 'base64url');
  if (authData.length < 37) throw new PasskeyError('Invalid authenticator data.', 400);

  const rpIdHash = authData.subarray(0, 32);
  const expectedHash = crypto.createHash('sha256').update(RP_ID).digest();
  if (!rpIdHash.equals(expectedHash)) throw new PasskeyError('RP ID hash mismatch.', 400);

  const flags = authData[0];
  if (!(flags & 0x01)) throw new PasskeyError('User not verified.', 400);

  const counter = authData.readUInt32BE(33);
  const coseKey = JSON.parse(stored.publicKey) as Ec2PublicKey;

  const clientDataHash = crypto.createHash('sha256').update(Buffer.from(credential.response.clientDataJSON, 'base64url')).digest();
  const toSign = Buffer.concat([authData, clientDataHash]);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: coseKey.x.toString('base64url'),
    y: coseKey.y.toString('base64url'),
  } as crypto.JsonWebKey;

  const key = crypto.createPublicKey({ key: jwk, format: 'jwk', type: 'public' });

  const signature = Buffer.from(credential.response.signature, 'base64url');
  const verified = crypto.verify('SHA256', toSign, key, signature);
  if (!verified) throw new PasskeyError('Signature verification failed.', 401);

  if (counter < stored.counter) throw new PasskeyError('Replay attack detected.', 401);

  updatePasskeyCounter(stored.id, counter);

  challenges.delete(challengeToken);
  const user = getOrCreateUser(challenge.userId);
  return user;
}
