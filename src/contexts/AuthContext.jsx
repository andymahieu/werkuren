import { createContext, useContext, useState, useEffect } from 'react';
import { API } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('wt'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Validate token on load
        if (token) {
            fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
                .then(async r => {
                    if (!r.ok) throw new Error();
                    // Token geldig: gebruiker (met actuele rol) uit de databank halen
                    const data = await r.json();
                    const fresh = data?.user;
                    if (!fresh) throw new Error();
                    localStorage.setItem('wu', JSON.stringify(fresh));
                    setUser(fresh);
                })
                .catch(() => {
                    localStorage.removeItem('wt');
                    localStorage.removeItem('wu');
                    setToken(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (username, password) => {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Inloggen mislukt.');
        localStorage.setItem('wt', data.token);
        localStorage.setItem('wu', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
    };

    const register = async (username, password) => {
        const res = await fetch(`${API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registratie mislukt.');
        localStorage.setItem('wt', data.token);
        localStorage.setItem('wu', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
    };

    const logout = () => {
        localStorage.removeItem('wt');
        localStorage.removeItem('wu');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

export const API_URL = API;
