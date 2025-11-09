import React, {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useState
} from 'react';

export const AuthContext = createContext({
    authToken: null,
    isAuthenticated: false,
    userName: null,
    authStrategy: null,
    login: async () => { },
    loginWithApiKey: async () => { },
    logout: () => { },
    authLoading: false,
    authError: null
});

const TOKEN_STORAGE_KEY = 'prun:authToken';
const USER_STORAGE_KEY = 'prun:authUser';
const STRATEGY_STORAGE_KEY = 'prun:authStrategy';

export const AUTH_STRATEGIES = {
    PASSWORD: 'password',
    API_KEY: 'api-key'
};

const normalizeString = (value) => {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
};

export const AuthProvider = ({ children }) => {
    const [authToken, setAuthToken] = useState(null);
    const [userName, setUserName] = useState(null);
    const [authStrategy, setAuthStrategy] = useState(null);
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState(null);

    useEffect(() => {
        try {
            const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
            const storedUser = window.localStorage.getItem(USER_STORAGE_KEY);
            const storedStrategy = window.localStorage.getItem(STRATEGY_STORAGE_KEY);
            if (storedToken) {
                setAuthToken(storedToken);
            }
            if (storedUser) {
                setUserName(storedUser);
            }
            if (storedStrategy && Object.values(AUTH_STRATEGIES).includes(storedStrategy)) {
                setAuthStrategy(storedStrategy);
            }
        } catch (storageError) {
            // eslint-disable-next-line no-console
            console.warn('Failed to read stored auth token', storageError);
        }
    }, []);

    const login = useCallback(async ({ userName: loginName, password }) => {
        const normalizedLoginName = normalizeString(loginName);
        setAuthLoading(true);
        setAuthError(null);
        try {
            const response = await fetch('https://rest.fnar.net/auth/login', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    UserName: loginName,
                    Password: password
                })
            });

            if (!response.ok) {
                const message = `Login failed with status ${response.status}`;
                throw new Error(message);
            }

            const payload = await response.json();

            const extractToken = data => {
                if (!data) {
                    return null;
                }

                if (typeof data === 'string') {
                    return data.trim();
                }

                if (typeof data === 'object') {
                    if (typeof data.Token === 'string') {
                        return data.Token.trim();
                    }
                    if (typeof data.AuthToken === 'string') {
                        return data.AuthToken.trim();
                    }
                    if (typeof data.BearerToken === 'string') {
                        return data.BearerToken.trim();
                    }
                    if (typeof data.token === 'string') {
                        return data.token.trim();
                    }
                    if (typeof data.authToken === 'string') {
                        return data.authToken.trim();
                    }
                    if (typeof data.bearerToken === 'string') {
                        return data.bearerToken.trim();
                    }

                    for (const value of Object.values(data)) {
                        const extracted = extractToken(value);
                        if (typeof extracted === 'string' && extracted.length > 0) {
                            return extracted.trim();
                        }
                    }
                }

                return null;
            };

            const token = extractToken(payload);

            if (!token) {
                throw new Error('Login succeeded but no auth token was returned.');
            }

            setAuthToken(token);
            setUserName(normalizedLoginName || null);
            setAuthStrategy(AUTH_STRATEGIES.PASSWORD);

            try {
                window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
                if (normalizedLoginName) {
                    window.localStorage.setItem(USER_STORAGE_KEY, normalizedLoginName);
                } else {
                    window.localStorage.removeItem(USER_STORAGE_KEY);
                }
                window.localStorage.setItem(STRATEGY_STORAGE_KEY, AUTH_STRATEGIES.PASSWORD);
            } catch (storageError) {
                // eslint-disable-next-line no-console
                console.warn('Failed to persist auth token', storageError);
            }

            return token;
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Login failed');
            setAuthToken(null);
            setUserName(null);
            setAuthStrategy(null);
            try {
                window.localStorage.removeItem(TOKEN_STORAGE_KEY);
                window.localStorage.removeItem(USER_STORAGE_KEY);
                window.localStorage.removeItem(STRATEGY_STORAGE_KEY);
            } catch (storageError) {
                // eslint-disable-next-line no-console
                console.warn('Failed to clear stored token', storageError);
            }
            throw error;
        } finally {
            setAuthLoading(false);
        }
    }, []);

    const loginWithApiKey = useCallback(async ({ userName: loginName, apiKey: apiKeyInput }) => {
        const normalizedLoginName = normalizeString(loginName);
        const trimmedKey = normalizeString(apiKeyInput);

        if (!normalizedLoginName) {
            throw new Error('Username is required when using an API key.');
        }

        if (!trimmedKey) {
            throw new Error('API key cannot be empty.');
        }

        setAuthLoading(true);
        setAuthError(null);

        try {
            setAuthToken(trimmedKey);
            setUserName(normalizedLoginName);
            setAuthStrategy(AUTH_STRATEGIES.API_KEY);

            try {
                window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmedKey);
                window.localStorage.setItem(USER_STORAGE_KEY, normalizedLoginName);
                window.localStorage.setItem(STRATEGY_STORAGE_KEY, AUTH_STRATEGIES.API_KEY);
            } catch (storageError) {
                // eslint-disable-next-line no-console
                console.warn('Failed to persist API key', storageError);
            }

            return trimmedKey;
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Failed to save API key');
            throw error;
        } finally {
            setAuthLoading(false);
        }
    }, []);

    const logout = useCallback(() => {
        setAuthToken(null);
        setUserName(null);
        setAuthError(null);
        setAuthStrategy(null);
        try {
            window.localStorage.removeItem(TOKEN_STORAGE_KEY);
            window.localStorage.removeItem(USER_STORAGE_KEY);
            window.localStorage.removeItem(STRATEGY_STORAGE_KEY);
        } catch (storageError) {
            // eslint-disable-next-line no-console
            console.warn('Failed to clear stored token', storageError);
        }
    }, []);

    const value = useMemo(() => ({
        authToken,
        isAuthenticated: Boolean(authToken),
        userName,
        authStrategy,
        login,
        loginWithApiKey,
        logout,
        authLoading,
        authError
    }), [authToken, userName, authStrategy, login, loginWithApiKey, logout, authLoading, authError]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
