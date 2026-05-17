import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const isProd = window.location.hostname !== 'localhost';
const API = isProd ? '/demo/Werkuren/api.php' : 'http://localhost:3001/api';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('wt'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Validate token on load
        if (token) {
            fetch(`${API}/settings`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => {
                    if (!r.ok) throw new Error();
                    // Token valid – restore user from stored data
                    const stored = localStorage.getItem('wu');
                    if (stored) setUser(JSON.parse(stored));
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
