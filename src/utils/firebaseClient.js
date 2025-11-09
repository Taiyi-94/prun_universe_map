import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig, { isFirebaseConfigured } from '../config/firebaseConfig';

let appInstance = null;
let firestoreInstance = null;

export const getFirebaseApp = () => {
    if (!isFirebaseConfigured()) {
        return null;
    }

    if (!appInstance) {
        const existingApp = getApps()[0];
        appInstance = existingApp || initializeApp(firebaseConfig);
    }

    return appInstance;
};

export const getFirestoreClient = () => {
    if (firestoreInstance) {
        return firestoreInstance;
    }

    const app = getFirebaseApp();
    if (!app) {
        return null;
    }

    firestoreInstance = getFirestore(app);
    return firestoreInstance;
};
