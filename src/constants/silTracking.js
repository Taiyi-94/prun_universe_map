const rawSilKey = typeof process.env.REACT_APP_SIL_TRACKER_API_KEY === 'string'
    ? process.env.REACT_APP_SIL_TRACKER_API_KEY
    : '';
const rawSilUser = typeof process.env.REACT_APP_SIL_TRACKER_USERNAME === 'string'
    ? process.env.REACT_APP_SIL_TRACKER_USERNAME
    : '';

const normalizeValue = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
};

export const SIL_TRACKER_API_KEY = normalizeValue(rawSilKey);
export const SIL_TRACKER_USERNAME = normalizeValue(rawSilUser) || 'OptimizedFunction';
