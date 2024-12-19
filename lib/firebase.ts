import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCSCU2-PATJuvnihCVCcH18y1VOIqFXPCA",
  authDomain: "quizoom-ac489.firebaseapp.com",
  projectId: "quizoom-ac489",
  storageBucket: "quizoom-ac489.firebasestorage.app",
  messagingSenderId: "210736116176",
  appId: "1:210736116176:web:4d67af58de27b6f19e89d5",
  measurementId: "G-WL80Y6FS7Z"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);