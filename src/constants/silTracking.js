import { getEnvValue } from '../utils/env';

const normalizeValue = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
};

export const SIL_TRACKER_API_KEY = normalizeValue(
    getEnvValue('REACT_APP_SIL_TRACKER_API_KEY')
);
export const SIL_TRACKER_USERNAME = normalizeValue(
    getEnvValue('REACT_APP_SIL_TRACKER_USERNAME')
) || 'OptimizedFunction';
