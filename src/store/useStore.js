import { create } from 'zustand';
import { normalizeRegistration, normalizeScheduleDay } from '../lib/time';
import { apiFetch } from '../lib/api';

const ACTIVE_ENTITY_KEY = 'wt_entity';

const readActiveEntity = () => {
    try { return Number(localStorage.getItem(ACTIVE_ENTITY_KEY)) || null; } catch { return null; }
};
const writeActiveEntity = (id) => {
    try { localStorage.setItem(ACTIVE_ENTITY_KEY, String(id ?? '')); } catch { /* geen opslag */ }
};

const DEFAULT_TYPES = ['Werk', 'Pauze', 'Ziekte', 'Verlof'];

const notify = (err) => {
    console.error(err);
    alert(err?.message || 'Er ging iets mis.');
};

// Leidt de effectieve instellingen af uit de actieve entiteit + persoonlijke instellingen
function deriveConfig(state) {
    const entity = state.entities.find(e => e.id === state.activeEntityId) || null;
    const s = entity?.settings;
    const timeStepLocked = !!s && !s.allowDeviateTimeStep;
    return {
        activeEntity: entity,
        timeStep: timeStepLocked ? s.timeStep : (state.userTimeStep || s?.timeStep || 30),
        timeStepLocked,
        scheduleRotationWeeks: state.userRotationWeeks || s?.scheduleRotationWeeks || 2,
        customRegistrationTypes: (s?.customRegistrationTypes || DEFAULT_TYPES.join(','))
            .split(',').map(t => t.trim()).filter(Boolean),
        autoSplitOvertime: !!s?.autoSplitOvertime,
        allowManualSplitOvertime: s ? !!s.allowManualSplitOvertime : true,
        approvalRequired: s?.approvalRequired || 'none',
        projectMode: s?.projectMode || 'off',
        lockDefaultProject: !!s?.lockDefaultProject,
        projects: entity?.projects || [],
        defaultProjectId: entity?.defaultProjectId ?? null,
        defaultSubjectId: entity?.defaultSubjectId ?? null,
    };
}

const EMPTY = {
    registrations: [],
    baseSchedule: [],
    submissions: [],
    overtimeBalance: 0,
    employeeStartDate: '',
    country: 'BE',
    holidays: [],
    userTimeStep: 30,
    userRotationWeeks: null,
    rotationStartDate: '',
    entities: [],
    activeEntityId: null,
    loaded: false,
};

export const useStore = create((set, get) => ({
    ...EMPTY,
    ...deriveConfig(EMPTY),

    // Alles ophalen
    loadAll: async () => {
        try {
            const [me, registrations, baseSchedule, settings, submissions] = await Promise.all([
                apiFetch('/me'),
                apiFetch('/registrations'),
                apiFetch('/base-schedule'),
                apiFetch('/settings'),
                apiFetch('/submissions').catch(() => []),
            ]);

            const entities = me?.entities || [];
            const stored = readActiveEntity();
            const activeEntityId = entities.some(e => e.id === stored)
                ? stored
                : (entities.find(e => e.id === me?.user?.entity_id)?.id ?? entities[0]?.id ?? null);

            const next = {
                registrations: Array.isArray(registrations) ? registrations.map(normalizeRegistration) : [],
                baseSchedule: Array.isArray(baseSchedule) ? baseSchedule.map(normalizeScheduleDay) : [],
                submissions: Array.isArray(submissions) ? submissions : [],
                overtimeBalance: settings?.overtimeBalance ?? 0,
                employeeStartDate: settings?.employeeStartDate ?? '',
                country: settings?.country || 'BE',
                userTimeStep: settings?.timeStep || 30,
                userRotationWeeks: settings?.userRotationWeeks || null,
                rotationStartDate: settings?.rotationStartDate || '',
                entities,
                activeEntityId,
            };
            set({ ...next, ...deriveConfig({ ...get(), ...next }), loaded: true });
            get().fetchHolidays(next.country);
        } catch (err) {
            if (err.status === 401) {
                try { localStorage.removeItem('wt'); localStorage.removeItem('wu'); } catch { /* */ }
                window.location.reload();
                return;
            }
            console.error('Fout bij laden van data:', err);
            // Nooit blijven hangen op 'Data laden...'
            set({ loaded: true });
        }
    },

    setActiveEntity: (id) => {
        writeActiveEntity(id);
        set(state => {
            const next = { ...state, activeEntityId: id };
            return { activeEntityId: id, ...deriveConfig(next) };
        });
    },

    fetchHolidays: async (country) => {
        try {
            const year = new Date().getFullYear();
            const results = await Promise.all([year - 1, year, year + 1].map(y =>
                fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/${country}`)
                    .then(r => (r.ok ? r.json() : []))
                    .catch(() => [])
            ));
            set({ holidays: results.flat() });
        } catch (err) {
            console.error('Failed to fetch holidays', err);
        }
    },

    // Registraties
    reloadRegistrations: async () => {
        const regs = await apiFetch('/registrations');
        set({ registrations: Array.isArray(regs) ? regs.map(normalizeRegistration) : [] });
    },

    addRegistration: async (rawReg) => {
        try {
            const newReg = await apiFetch('/registrations', { method: 'POST', body: normalizeRegistration(rawReg) });
            set(state => ({ registrations: [...state.registrations, normalizeRegistration(newReg)] }));
            return true;
        } catch (err) { notify(err); return false; }
    },

    addRegistrations: async (rawRegs) => {
        try {
            const all = await apiFetch('/registrations/bulk', { method: 'POST', body: rawRegs.map(normalizeRegistration) });
            set({ registrations: Array.isArray(all) ? all.map(normalizeRegistration) : [] });
            return true;
        } catch (err) { notify(err); return false; }
    },

    updateRegistration: async (id, rawReg) => {
        try {
            const updated = await apiFetch(`/registrations/${id}`, { method: 'PUT', body: normalizeRegistration(rawReg) });
            set(state => ({
                registrations: state.registrations.map(r => (r.id === id ? normalizeRegistration(updated) : r)),
            }));
            return true;
        } catch (err) { notify(err); return false; }
    },

    deleteRegistration: async (id) => {
        try {
            await apiFetch(`/registrations/${id}`, { method: 'DELETE' });
            set(state => ({ registrations: state.registrations.filter(r => r.id !== id) }));
            return true;
        } catch (err) { notify(err); return false; }
    },

    // Indienen ter goedkeuring
    submitPeriod: async (periodType, periodStart, periodEnd) => {
        try {
            await apiFetch('/submissions', {
                method: 'POST',
                body: { entity_id: get().activeEntityId, period_type: periodType, period_start: periodStart, period_end: periodEnd },
            });
            const [subs] = await Promise.all([apiFetch('/submissions'), get().reloadRegistrations()]);
            set({ submissions: subs });
            return true;
        } catch (err) { notify(err); return false; }
    },

    withdrawSubmission: async (id) => {
        try {
            await apiFetch(`/submissions/${id}`, { method: 'DELETE' });
            const [subs] = await Promise.all([apiFetch('/submissions'), get().reloadRegistrations()]);
            set({ submissions: subs });
            return true;
        } catch (err) { notify(err); return false; }
    },

    // Basisrooster
    updateBaseSchedule: async (dayIndex, rawSchedule) => {
        const schedule = normalizeScheduleDay(rawSchedule);
        set(state => {
            const newSchedule = [...state.baseSchedule];
            newSchedule[dayIndex] = { ...newSchedule[dayIndex], ...schedule };
            return { baseSchedule: newSchedule };
        });
        try {
            await apiFetch(`/base-schedule/${dayIndex}`, { method: 'PUT', body: schedule });
        } catch (err) { notify(err); }
    },

    // Persoonlijke instellingen (enkel de gewijzigde velden worden verstuurd)
    saveSettings: async (partial) => {
        try {
            await apiFetch('/settings', { method: 'PUT', body: partial });
        } catch (err) { notify(err); }
    },

    setOvertimeBalance: (balance) => {
        const safe = isNaN(Number(balance)) ? 0 : Number(balance);
        set({ overtimeBalance: safe });
        get().saveSettings({ overtimeBalance: safe });
    },

    addOvertime: (hours) => {
        const next = get().overtimeBalance + hours;
        set({ overtimeBalance: next });
        get().saveSettings({ overtimeBalance: next });
    },

    setEmployeeStartDate: (date) => {
        set({ employeeStartDate: date });
        get().saveSettings({ employeeStartDate: date });
    },

    setCountry: (country) => {
        set({ country });
        get().saveSettings({ country });
        get().fetchHolidays(country);
    },

    setTimeStep: (timeStep) => {
        set(state => ({ userTimeStep: timeStep, ...deriveConfig({ ...state, userTimeStep: timeStep }) }));
        get().saveSettings({ timeStep });
    },

    setRotation: (weeks, startDate) => {
        set(state => {
            const next = { ...state, userRotationWeeks: weeks || null, rotationStartDate: startDate ?? state.rotationStartDate };
            return { userRotationWeeks: next.userRotationWeeks, rotationStartDate: next.rotationStartDate, ...deriveConfig(next) };
        });
        get().saveSettings({ userRotationWeeks: weeks || null, rotationStartDate: startDate ?? get().rotationStartDate });
    },

    reset: () => set({ ...EMPTY, ...deriveConfig(EMPTY) }),
}));
