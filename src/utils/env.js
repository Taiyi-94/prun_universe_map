const getRuntimeEnv = () => {
    if (typeof window === 'undefined') {
        return {};
    }

    const candidate = window.__ENV__;
    if (candidate && typeof candidate === 'object') {
        return candidate;
    }

    return {};
};

/**
 * Fetches an environment value from runtime config or build-time process.env.
 * Runtime config is sourced from public/env-config.js so hosting can supply values without shipping .env files.
 */
export const getEnvValue = (key) => {
    if (typeof key !== 'string' || key.length === 0) {
        return '';
    }

    const runtimeEnv = getRuntimeEnv();
    const runtimeValue = runtimeEnv[key];
    if (typeof runtimeValue === 'string' && runtimeValue.trim().length > 0) {
        return runtimeValue.trim();
    }

    if (typeof process !== 'undefined' && process.env && typeof process.env[key] === 'string') {
        const buildValue = process.env[key].trim();
        if (buildValue.length > 0) {
            return buildValue;
        }
    }

    return '';
};

export const getAllEnvValues = (keys) => {
    if (!Array.isArray(keys)) {
        return {};
    }

    return keys.reduce((acc, key) => {
        acc[key] = getEnvValue(key);
        return acc;
    }, {});
};
