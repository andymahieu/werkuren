import { create } from 'zustand';

const isProd = window.location.hostname !== 'localhost';
const API = isProd ? './api.php' : 'http://localhost:3001/api';

function getToken() {
    return localStorage.getItem('wt');
}

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

export const useStore = create((set, get) => ({
    registrations: [],
    baseSchedule: [],
    overtimeBalance: 0,
    employeeStartDate: '',
    country: 'BE',
    holidays: [],
    entityTimeStep: 30,
    allowDeviateTimeStep: false,
    scheduleRotationWeeks: 2,
    approvalRequired: 'none',
    customRegistrationTypes: ['Werk', 'Pauze', 'Ziekte', 'Verlof'],
    autoSplitOvertime: false,
    defaultProjectId: null,
    defaultSubjectId: null,
    loaded: false,

    // Load all data from API
    loadAll: async () => {
        const [regsRes, schedRes, settingsRes] = await Promise.all([
            fetch(`${API}/registrations`, { headers: authHeaders() }),
            fetch(`${API}/base-schedule`, { headers: authHeaders() }),
            fetch(`${API}/settings`, { headers: authHeaders() }),
        ]);
        const registrations = await regsRes.json();
        const baseSchedule = await schedRes.json();
        const settings = await settingsRes.json();
        
        const country = settings.country || 'BE';
        const timeStep = settings.timeStep || 30;
        const customRegistrationTypes = (settings.customRegistrationTypes || 'Werk,Pauze,Ziekte,Verlof').split(',').map(s => s.trim()).filter(Boolean);

        set({
            registrations,
            baseSchedule,
            overtimeBalance: settings.overtimeBalance,
            employeeStartDate: settings.employeeStartDate,
            country: country,
            timeStep: timeStep,
            entityTimeStep: settings.entityTimeStep || 30,
            allowDeviateTimeStep: settings.allowDeviateTimeStep,
            scheduleRotationWeeks: settings.scheduleRotationWeeks || 2,
            approvalRequired: settings.approvalRequired || 'none',
            customRegistrationTypes,
            autoSplitOvertime: settings.autoSplitOvertime,
            defaultProjectId: settings.defaultProjectId,
            defaultSubjectId: settings.defaultSubjectId,
            loaded: true,
        });

        // Fetch holidays after setting country
        get().fetchHolidays(country);
    },

    fetchHolidays: async (country) => {
        try {
            const year = new Date().getFullYear();
            const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
            if (res.ok) {
                const holidays = await res.json();
                set({ holidays });
            }
        } catch (err) {
            console.error("Failed to fetch holidays", err);
        }
    },

    // Registrations
    addRegistration: async (reg) => {
        const res = await fetch(`${API}/registrations`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(reg),
        });
        const newReg = await res.json();
        set(state => ({ registrations: [...state.registrations, newReg] }));
    },

    addRegistrations: async (regs) => {
        const res = await fetch(`${API}/registrations/bulk`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(regs),
        });
        const all = await res.json();
        set({ registrations: all });
    },

    updateRegistration: async (id, reg) => {
        await fetch(`${API}/registrations/${id}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify(reg),
        });
        set(state => ({
            registrations: state.registrations.map(r => r.id === id ? { ...r, ...reg } : r),
        }));
    },

    deleteRegistration: async (id) => {
        await fetch(`${API}/registrations/${id}`, { method: 'DELETE', headers: authHeaders() });
        set(state => ({ registrations: state.registrations.filter(r => r.id !== id) }));
    },

    // Base schedule
    updateBaseSchedule: async (dayIndex, schedule) => {
        await fetch(`${API}/base-schedule/${dayIndex}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify(schedule),
        });
        set(state => {
            const newSchedule = [...state.baseSchedule];
            newSchedule[dayIndex] = { ...newSchedule[dayIndex], ...schedule };
            return { baseSchedule: newSchedule };
        });
    },

    // Settings
    setOvertimeBalance: async (balance) => {
        const safeBalance = isNaN(Number(balance)) ? 0 : Number(balance);
        set(state => {
            fetch(`${API}/settings`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ overtimeBalance: safeBalance, employeeStartDate: state.employeeStartDate, country: state.country, timeStep: state.timeStep }),
            });
            return { overtimeBalance: safeBalance };
        });
    },

    setEmployeeStartDate: async (date) => {
        set(state => {
            fetch(`${API}/settings`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ overtimeBalance: state.overtimeBalance, employeeStartDate: date, country: state.country, timeStep: state.timeStep }),
            });
            return { employeeStartDate: date };
        });
    },

    setCountry: async (country) => {
        set(state => {
            fetch(`${API}/settings`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ overtimeBalance: state.overtimeBalance, employeeStartDate: state.employeeStartDate, country, timeStep: state.timeStep }),
            });
            return { country };
        });
        get().fetchHolidays(country);
    },

    addOvertime: async (hours) => {
        set(state => {
            const newBalance = state.overtimeBalance + hours;
            fetch(`${API}/settings`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ overtimeBalance: newBalance, employeeStartDate: state.employeeStartDate, country: state.country, timeStep: state.timeStep }),
            });
            return { overtimeBalance: newBalance };
        });
    },

    setTimeStep: async (timeStep) => {
        set(state => {
            fetch(`${API}/settings`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ overtimeBalance: state.overtimeBalance, employeeStartDate: state.employeeStartDate, country: state.country, timeStep }),
            });
            return { timeStep };
        });
    },

    // Reset store on logout
    reset: () => set({ registrations: [], baseSchedule: [], overtimeBalance: 0, employeeStartDate: '', country: 'BE', timeStep: 30, holidays: [], loaded: false }),
}));
