/*
 * Copy this file to public/env-config.js (which is gitignored) and populate the values before building/deploying.
 * Keys are exposed to the client, so do not place server-only secrets here.
 */
window.__ENV__ = window.__ENV__ || {
    REACT_APP_SIL_TRACKER_API_KEY: '',
    REACT_APP_SIL_TRACKER_USERNAME: '',
    REACT_APP_FIREBASE_API_KEY: '',
    REACT_APP_FIREBASE_AUTH_DOMAIN: '',
    REACT_APP_FIREBASE_PROJECT_ID: '',
    REACT_APP_FIREBASE_STORAGE_BUCKET: '',
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID: '',
    REACT_APP_FIREBASE_APP_ID: '',
    REACT_APP_FIREBASE_MEASUREMENT_ID: ''
};
