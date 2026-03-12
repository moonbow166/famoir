/**
 * Firebase client SDK configuration for Famoir.
 *
 * Uses Phone Number (SMS OTP) authentication.
 * Config values are loaded from Vite env variables (VITE_FIREBASE_*).
 */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth";

const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

// Skip Firebase init in DEV_MODE to avoid invalid-api-key errors
const app = DEV_MODE ? null : initializeApp(firebaseConfig);
export const auth: Auth = DEV_MODE ? ({} as Auth) : getAuth(app!);

// ---------------------------------------------------------------------------
// Phone Auth helpers
// ---------------------------------------------------------------------------

let recaptchaVerifier: RecaptchaVerifier | null = null;

/** Initialize invisible reCAPTCHA on a given button element. */
export function setupRecaptcha(buttonId: string): RecaptchaVerifier {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
  }
  recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
    size: "invisible",
  });
  return recaptchaVerifier;
}

/** Send SMS verification code to the given phone number. Returns ConfirmationResult. */
export async function sendSmsCode(
  phoneNumber: string,
  verifier: RecaptchaVerifier,
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneNumber, verifier);
}

/** Sign out the current user. */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/** Get the current user's ID token for backend API calls. */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
