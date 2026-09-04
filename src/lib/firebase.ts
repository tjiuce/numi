import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, increment, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Helper function to fetch or initialize the global stats document
export async function getGlobalStats() {
  const statsRef = doc(db, 'global_stats', 'counters');
  const docSnap = await getDoc(statsRef);
  
  if (docSnap.exists()) {
    return docSnap.data();
  } else {
    // Initialize if it doesn't exist
    const defaultStats = { totalItems: 0, totalUsers: 0 };
    await setDoc(statsRef, defaultStats);
    return defaultStats;
  }
}

// Helper function to update the global stats after a successful transfer
export async function updateGlobalStats(itemsTransferred: number) {
  const statsRef = doc(db, 'global_stats', 'counters');
  await setDoc(statsRef, {
    totalItems: increment(itemsTransferred),
    totalUsers: increment(1)
  }, { merge: true });
}
