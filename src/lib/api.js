// Gedeelde API-hulpfuncties. In productie praat de app met api.php (PHP + MySQL).
const isLocalDev = window.location.hostname === 'localhost';
export const API = isLocalDev ? 'http://localhost:3001/api' : './api.php';

export const getToken = () => {
    try { return localStorage.getItem('wt'); } catch { return null; }
};

export const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
});

// fetch + JSON, gooit een Error met de foutmelding van de server
export async function apiFetch(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: authHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
        const err = new Error(data?.error || `Fout ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}
