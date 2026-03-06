/**
 * WebAuthn (FIDO2) biometric hook.
 *
 * Flow:
 *  1. First use: register() — creates a passkey tied to this device (fingerprint / face ID).
 *  2. Before every spend: authenticate() — triggers the OS biometric prompt and returns true on success.
 *
 * Credential ID is stored in localStorage so the same passkey is used across sessions.
 * The server-side challenge is mocked here (random bytes) — in production you MUST
 * generate and verify challenges on your backend to prevent replay attacks.
 */

const RP_ID = window.location.hostname;
const RP_NAME = 'Stark-Circle';
const CRED_KEY = 'sc_webauthn_cred_id';

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function randomChallenge(): Uint8Array {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

export function isBiometricAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  );
}

/**
 * Register a new passkey for this user on this device.
 * Call once after onboarding. Returns the credential ID (base64url) or throws.
 */
export async function registerBiometric(userId: string, userName: string): Promise<string> {
  const challenge = randomChallenge();

  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { id: RP_ID, name: RP_NAME },
      user: {
        id: new TextEncoder().encode(userId),
        name: userName,
        displayName: userName,
      },
      challenge: challenge.buffer as ArrayBuffer,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },  // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // device biometric only (no security keys)
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  }) as PublicKeyCredential;

  const credId = base64url(credential.rawId);
  localStorage.setItem(CRED_KEY, credId);
  return credId;
}

/**
 * Trigger the OS biometric prompt. Returns true if the user verified successfully.
 * Call before every spend to confirm intent.
 */
export async function authenticateBiometric(): Promise<boolean> {
  const storedCredId = localStorage.getItem(CRED_KEY);
  if (!storedCredId) {
    throw new Error('No passkey registered on this device. Register first.');
  }

  const challenge = randomChallenge();

  // Decode base64url back to ArrayBuffer
  const credIdBytes = new Uint8Array(
    atob(storedCredId.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map((c) => c.charCodeAt(0))
  ).buffer as ArrayBuffer;

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challenge.buffer as ArrayBuffer,
      rpId: RP_ID,
      allowCredentials: [{ type: 'public-key', id: credIdBytes }],
      userVerification: 'required',
      timeout: 60000,
    },
  }) as PublicKeyCredential;

  // If we reach here the OS biometric check passed (assertion is non-null).
  return assertion !== null;
}

/**
 * True if this device has a registered passkey for Stark-Circle.
 */
export function hasBiometricRegistered(): boolean {
  return !!localStorage.getItem(CRED_KEY);
}
