// src/lib/firebase.ts
import * as admin from 'firebase-admin';

// Evitamos que se inicialice varias veces al recargar (Singleton)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Este replace es VITAL para que la clave privada funcione
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export { db };