// Firebase configuration
// Replace these values with your Firebase project config from Firebase Console
import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const auth = getAuth(app);

// Secondary app for admin creating users without signing out
import { initializeApp as initializeApp2 } from 'firebase/app';
import { getAuth as getAuth2 } from 'firebase/auth';

let secondaryApp;
let secondaryAuth;

export function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = initializeApp2(firebaseConfig, 'secondary');
    secondaryAuth = getAuth2(secondaryApp);
  }
  return secondaryAuth;
}

export default app;
