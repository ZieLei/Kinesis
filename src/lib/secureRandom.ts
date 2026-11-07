import * as Crypto from "expo-crypto";

/**
 * Cryptographically secure identifiers from the platform CSPRNG
 * (iOS SecRandomCopyBytes, Android SecureRandom, browser
 * crypto.getRandomValues) via expo-crypto. Never use Math.random()
 * for identifiers that must be unpredictable or collision-free.
 */

const BASE32_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Uppercase code without ambiguous characters (no I, O, 0, 1).
 * 32 symbols, so each character carries exactly 5 bits.
 */
export function randomCode(length: number): string {
  const bytes = Crypto.getRandomBytes(length);
  let code = "";

  for (const byte of bytes) {
    // 256 is a multiple of 32, so the modulo introduces no bias.
    code += BASE32_ALPHABET[byte % BASE32_ALPHABET.length];
  }

  return code;
}

export function randomUUID(): string {
  return Crypto.randomUUID();
}
