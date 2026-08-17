// lib/firebase/client.ts
//
// Firebase client-side initialization.
// This runs in the browser — only put PUBLIC config values here.
// Never put secret keys (like a Firebase Admin service account) in this file.

import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyD1k0SnQJDazL2kt6d8AbvKJp-tO_LeziA",
  authDomain: "epermits-6f549.firebaseapp.com",
  projectId: "epermits-6f549",
  storageBucket: "epermits-6f549.firebasestorage.app",
  messagingSenderId: "729203405440",
  appId: "1:729203405440:web:0a5cb3ebbd7e66b7e66c65",
  measurementId: "G-1TJM0YC8NG",
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
