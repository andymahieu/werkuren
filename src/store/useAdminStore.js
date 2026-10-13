import { create } from 'zustand';
import { useStore } from './useStore';

const API = import.meta.env.PROD ? 'https://www.isandy.be/werkuren/api.php' : 'http://localhost:3001/api';

const authHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
};

export const useAdminStore = create((set, get) => ({
    companies: [],
    entities: [],
    users: [],
    entitySettings: null,

    fetchSuperAdminData: async () => {
        try {
            const [compRes, entRes] = await Promise.all([
                fetch(`${API}/admin/companies`, { headers: authHeaders() }),
                fetch(`${API}/admin/entities`, { headers: authHeaders() })
            ]);
            set({ companies: await compRes.json(), entities: await entRes.json() });
        } catch (err) {
            console.error("Failed to fetch super admin data", err);
        }
    },

    fetchEntityAdminData: async (entityId = null) => {
        try {
            let url = `${API}/admin/users`;
            let settingsUrl = `${API}/admin/entity-settings`;
            if (entityId) {
                url += `?entity_id=${entityId}`;
                settingsUrl += `?entity_id=${entityId}`;
            }
            const [usersRes, settingsRes] = await Promise.all([
                fetch(url, { headers: authHeaders() }),
                fetch(settingsUrl, { headers: authHeaders() })
            ]);
            set({ users: await usersRes.json(), entitySettings: await settingsRes.json() });
        } catch (err) {
            console.error("Failed to fetch entity admin data", err);
        }
    },

    createCompany: async (name) => {
        const res = await fetch(`${API}/admin/companies`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name })
        });
        const newComp = await res.json();
        set(state => ({ companies: [...state.companies, newComp] }));
    },

    createEntity: async (name, company_id) => {
        const res = await fetch(`${API}/admin/entities`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name, company_id })
        });
        const newEnt = await res.json();
        set(state => ({ entities: [...state.entities, { ...newEnt, company_name: get().companies.find(c => c.id == company_id)?.name }] }));
    },

    createUser: async (userData) => {
        const res = await fetch(`${API}/admin/users`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(userData)
        });
        if (!res.ok) throw new Error("Fout bij aanmaken");
        const newUser = await res.json();
        set(state => ({ users: [...state.users, newUser] }));
    },

    updateEntitySettings: async (settings) => {
        await fetch(`${API}/admin/entity-settings`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(settings)
        });
        set({ entitySettings: settings });
    }
}));
