import { api } from './api';

interface RegisterOptions {
  challenge: string;
  rpId: string;
  rpName: string;
  userId: string;
  userName: string;
  userDisplay: string;
}

/** Runs the WebAuthn registration ceremony for an existing account and stores the credential server-side. */
export async function registerPasskey(email: string): Promise<void> {
  const options = await api.post<RegisterOptions>('/auth/passkey/register/start', { email });

  if (!window.PublicKeyCredential) {
    throw new Error('Passkeys are not supported in this browser.');
  }

  const credential = await (navigator.credentials as any).create({
    publicKey: {
      challenge: options.challenge,
      rp: { id: options.rpId, name: options.rpName },
      user: {
        id: options.userId,
        name: options.userName,
        displayName: options.userDisplay,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        requireResidentKey: false,
        userVerification: 'preferred',
      },
      timeout: 60_000,
    },
  });

  await api.post('/auth/passkey/register/finish', {
    challenge: options.challenge,
    credential: {
      id: credential.id,
      rawId: credential.rawId,
      response: {
        attestationObject: btoa(String.fromCharCode(...new Uint8Array(credential.response.attestationObject))),
        clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))),
      },
    },
  });
}
