import { getEnvValue } from '../utils/env';

const firebaseConfig = {
    apiKey: getEnvValue('REACT_APP_FIREBASE_API_KEY'),
    authDomain: getEnvValue('REACT_APP_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnvValue('REACT_APP_FIREBASE_PROJECT_ID'),
    storageBucket: getEnvValue('REACT_APP_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnvValue('REACT_APP_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnvValue('REACT_APP_FIREBASE_APP_ID'),
    measurementId: getEnvValue('REACT_APP_FIREBASE_MEASUREMENT_ID')
};

export const isFirebaseConfigured = () => {
    const requiredKeys = ['apiKey', 'projectId'];
    return requiredKeys.every((key) => (
        typeof firebaseConfig[key] === 'string' && firebaseConfig[key].length > 0
    ));
};

export default firebaseConfig;
