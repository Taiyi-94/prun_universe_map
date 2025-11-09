import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import './LoginForm.css';

const LoginForm = ({ onClose }) => {
    const { login, loginWithApiKey, authLoading, authError } = useContext(AuthContext);
    const [userName, setUserName] = useState('');
    const [password, setPassword] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [localError, setLocalError] = useState(null);

    useEffect(() => {
        setLocalError(authError);
    }, [authError]);

    useEffect(() => {
        const handleKeyDown = event => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const trimmedUserName = useMemo(() => userName.trim(), [userName]);
    const trimmedPassword = useMemo(() => password.trim(), [password]);
    const trimmedApiKey = useMemo(() => apiKey.trim(), [apiKey]);

    const submitDisabled = useMemo(() => {
        const hasUserName = trimmedUserName.length > 0;
        const hasPassword = trimmedPassword.length > 0;
        const hasApiKey = trimmedApiKey.length > 0;
        return authLoading || !hasUserName || (!hasPassword && !hasApiKey);
    }, [authLoading, trimmedUserName, trimmedPassword, trimmedApiKey]);

    const handleSubmit = async event => {
        event.preventDefault();
        setLocalError(null);

        try {
            if (trimmedApiKey.length > 0) {
                if (!trimmedUserName) {
                    setLocalError('Username is required when using an API key.');
                    return;
                }
                await loginWithApiKey({ userName: trimmedUserName, apiKey: trimmedApiKey });
            } else {
                if (!trimmedPassword) {
                    setLocalError('Password is required when an API key is not provided.');
                    return;
                }
                await login({ userName: trimmedUserName, password: trimmedPassword });
            }
            onClose();
        } catch (error) {
            setLocalError(error instanceof Error ? error.message : 'Login failed');
        }
    };

    return (
        <div
            className="login-overlay"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div className="login-modal" onClick={event => event.stopPropagation()}>
                <div className="login-modal-header">
                    <h2>Sign In</h2>
                    <button
                        type="button"
                        className="login-close-button"
                        onClick={onClose}
                        aria-label="Close login form"
                    >
                        &times;
                    </button>
                </div>
                <p className="login-hint">
                    Enter your username and either a password or an API key. You don&apos;t need both.
                </p>
                <form className="login-form" onSubmit={handleSubmit}>
                    <label htmlFor="login-username">Username
                        <span className="required-indicator" aria-hidden="true">*</span>
                        <span className="sr-only"> (required)</span>
                    </label>
                    <input
                        id="login-username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        value={userName}
                        onChange={event => setUserName(event.target.value)}
                        disabled={authLoading}
                    />

                    <label htmlFor="login-password">Password (optional if API key provided)</label>
                    <input
                        id="login-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                        disabled={authLoading}
                    />

                    <div className="login-divider" aria-hidden="true">
                        <span className="divider-line" />
                        <span className="divider-text">or</span>
                        <span className="divider-line" />
                    </div>

                    <label htmlFor="login-api-key">API Key (optional if password entered)</label>
                    <input
                        id="login-api-key"
                        name="apiKey"
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={event => setApiKey(event.target.value)}
                        disabled={authLoading}
                        placeholder="Paste your API key"
                    />

                    {localError && (
                        <div className="login-error" role="alert">
                            {localError}
                        </div>
                    )}

                    <div className="login-actions">
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={onClose}
                            disabled={authLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="primary-button"
                            disabled={submitDisabled}
                        >
                            {authLoading ? 'Signing In…' : 'Continue'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginForm;
