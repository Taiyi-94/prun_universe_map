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
    login: async () => { },
    loginWithApiKey: async () => { },
    logout: () => { },
    authLoading: false,
    authError: null
});

const TOKEN_STORAGE_KEY = 'prun:authToken';
const USER_STORAGE_KEY = 'prun:authUser';

export const AuthProvider = ({ children }) => {
    const [authToken, setAuthToken] = useState(null);
    const [userName, setUserName] = useState(null);
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState(null);

    useEffect(() => {
        try {
            const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
            const storedUser = window.localStorage.getItem(USER_STORAGE_KEY);
            if (storedToken) {
                setAuthToken(storedToken);
            }
            if (storedUser) {
                setUserName(storedUser);
            }
        } catch (storageError) {
            // eslint-disable-next-line no-console
            console.warn('Failed to read stored auth token', storageError);
        }
    }, []);

    const login = useCallback(async ({ userName: loginName, password }) => {
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
            setUserName(loginName || null);

            try {
                window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
                if (loginName) {
                    window.localStorage.setItem(USER_STORAGE_KEY, loginName);
                } else {
                    window.localStorage.removeItem(USER_STORAGE_KEY);
                }
            } catch (storageError) {
                // eslint-disable-next-line no-console
                console.warn('Failed to persist auth token', storageError);
            }

            return token;
        } catch (error) {
            setAuthError(error instanceof Error ? error.message : 'Login failed');
            setAuthToken(null);
            setUserName(null);
            try {
                window.localStorage.removeItem(TOKEN_STORAGE_KEY);
                window.localStorage.removeItem(USER_STORAGE_KEY);
            } catch (storageError) {
                // eslint-disable-next-line no-console
                console.warn('Failed to clear stored token', storageError);
            }
            throw error;
        } finally {
            setAuthLoading(false);
        }
    }, []);

    const loginWithApiKey = useCallback(async apiKeyInput => {
        const trimmedKey = typeof apiKeyInput === 'string' ? apiKeyInput.trim() : '';

        if (!trimmedKey) {
            throw new Error('API key cannot be empty.');
        }

        setAuthLoading(true);
        setAuthError(null);

        try {
            setAuthToken(trimmedKey);
            setUserName('API Key');

            try {
                window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmedKey);
                window.localStorage.setItem(USER_STORAGE_KEY, 'API Key');
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
        try {
            window.localStorage.removeItem(TOKEN_STORAGE_KEY);
            window.localStorage.removeItem(USER_STORAGE_KEY);
        } catch (storageError) {
            // eslint-disable-next-line no-console
            console.warn('Failed to clear stored token', storageError);
        }
    }, []);

    const value = useMemo(() => ({
        authToken,
        isAuthenticated: Boolean(authToken),
        userName,
        login,
        loginWithApiKey,
        logout,
        authLoading,
        authError
    }), [authToken, userName, login, loginWithApiKey, logout, authLoading, authError]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
