// lib/firebase/client.ts
//
// Firebase client-side initialization.
// This runs in the browser — only put PUBLIC config values here.
// Never put secret keys (like a Firebase Admin service account) in this file.

import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

// Nilai-nilai ini diambil dari environment variables (.env.local)
// supaya file ini aman di-commit ke git dan gampang beda-beda per environment.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Avoid re-initializing on hot reload / multiple imports
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Returns a Firebase Messaging instance, or null if the browser
 * doesn't support it (e.g. server-side render, old Safari, etc).
 * Always call this from client components only.
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  return getMessaging(firebaseApp);
}
