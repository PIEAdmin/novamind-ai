import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBiP98Erv2xiMtMFqh46Y8ReBEH1v2dw3E',
  authDomain: 'novamind-ai-5417c.firebaseapp.com',
  projectId: 'novamind-ai-5417c',
  storageBucket: 'novamind-ai-5417c.firebasestorage.app',
  messagingSenderId: '1027376518343',
  appId: '1:1027376518343:web:9a6f3c6b1d4f8e2a3b5c7d'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
