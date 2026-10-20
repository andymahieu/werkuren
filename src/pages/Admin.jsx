import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store/useStore';
import { apiFetch, API } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { NATIVE_SELECT, formatDuration, getTypeStyle, STATUS_LABEL, STATUS_STYLE } from '../lib/ui';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Settings2, Users, FolderKanban, CheckSquare, Webhook, Copy, RefreshCw } from 'lucide-react';

const ROLE_LABEL = { user: 'Werknemer', entity_admin: 'Entiteit admin', super_admin: 'Super admin' };

const showError = (err) => alert(err?.message || 'Er ging iets mis.');
const refreshOwnData = () => useStore.getState().loadAll();

function Checkbox({ id, checked, onChange, children }) {
    return (
        <div className="flex items-start gap-2">
            <input id={id} type="checkbox" className="mt-1 h-4 w-4" checked={!!checked} onChange={e => onChange(e.target.checked ? 1 : 0)} />
            <Label htmlFor={id} className="font-normal leading-snug cursor-pointer">{children}</Label>
        </div>
    );
}

const periodText = (s) => {
    const start = parseISO(s.period_start);
    const end = parseISO(s.period_end);
    if (s.period_type === 'day') return format(start, 'EEEE d MMMM yyyy', { locale: nl });
    return `${s.period_type === 'workweek' ? 'Werkweek' : 'Week'} ${format(start, 'd MMM', { locale: nl })} - ${format(end, 'd MMM yyyy', { locale: nl })}`;
};

/* ---------------- INSTELLINGEN ---------------- */
function SettingsPanel({ entityId }) {
    const [s, setS] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setS(null);
        apiFetch(`/admin/entity-settings?entity_id=${entityId}`).then(setS).catch(showError);
    }, [entityId]);

    if (!s) return <p className="text-sm text-muted-foreground">Laden...</p>;
    const set = (patch) => setS({ ...s, ...patch });

    const save = async () => {
        setSaving(true);
        try {
            setS(await apiFetch(`/admin/entity-settings?entity_id=${entityId}`, { method: 'PUT', body: s }));
            refreshOwnData();
        } catch (err) { showError(err); }
        setSaving(false);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                    <h3 className="font-semibold">Tijd & rooster</h3>
                    <div className="space-y-1">
                        <Label htmlFor="ts">Kortste tijdseenheid</Label>
                        <select id="ts" className={NATIVE_SELECT} value={s.time_step} onChange={e => set({ time_step: Number(e.target.value) })}>
                            {[5, 10, 15, 30, 60].map(v => <option key={v} value={v}>{v} minuten</option>)}
                        </select>
                    </div>
                    <Checkbox id="dev" checked={s.allow_deviate_time_step} onChange={v => set({ allow_deviate_time_step: v })}>
                        Gebruikers mogen zelf een andere tijdseenheid kiezen
                    </Checkbox>
                    <div className="space-y-1">
                        <Label htmlFor="rot">Roterend uurrooster (standaard voor alle gebruikers)</Label>
                        <select id="rot" className={NATIVE_SELECT} value={s.schedule_rotation_weeks} onChange={e => set({ schedule_rotation_weeks: Number(e.target.value) })}>
                            <option value={1}>1 week (vast rooster)</option>
                            <option value={2}>2 weken</option>
                            <option value={3}>3 weken</option>
                            <option value={4}>4 weken</option>
                        </select>
                        <p className="text-xs text-muted-foreground">Per gebruiker kun je dit afwijkend instellen bij Gebruikers.</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <h3 className="font-semibold">Registraties</h3>
                    <div className="space-y-1">
                        <Label htmlFor="types">Registratietypes (komma gescheiden)</Label>
                        <Input id="types" placeholder="Werk,Pauze,Ziekte,Verlof" value={s.custom_registration_types || ''} onChange={e => set({ custom_registration_types: e.target.value })} />
                        <p className="text-xs text-muted-foreground">Leeg = Werk, Pauze, Ziekte, Verlof.</p>
                    </div>
                    <Checkbox id="auto" checked={s.auto_split_overtime} onChange={v => set({ auto_split_overtime: v })}>
                        Werkuren buiten het rooster automatisch afsplitsen naar "Overuur"
                    </Checkbox>
                    <Checkbox id="manual" checked={s.allow_manual_split_overtime} onChange={v => set({ allow_manual_split_overtime: v })}>
                        Knop per dag tonen om uren manueel op te splitsen in overuren
                    </Checkbox>
                </div>

                <div className="space-y-3">
                    <h3 className="font-semibold">Projectregistratie</h3>
                    <div className="space-y-1">
                        <Label htmlFor="pm">Project bij een registratie</Label>
                        <select id="pm" className={NATIVE_SELECT} value={s.project_mode} onChange={e => set({ project_mode: e.target.value })}>
                            <option value="off">Uit</option>
                            <option value="optional">Optioneel</option>
                            <option value="required">Verplicht</option>
                        </select>
                        <p className="text-xs text-muted-foreground">Voor pauze, ziekte, verlof en feestdag wordt nooit een project gevraagd.</p>
                    </div>
                    <Checkbox id="lock" checked={s.lock_default_project} onChange={v => set({ lock_default_project: v })}>
                        Vast project van een gebruiker vergrendelen (de gebruiker kan het niet wijzigen)
                    </Checkbox>
                </div>

                <div className="space-y-3">
                    <h3 className="font-semibold">Goedkeuring</h3>
                    <div className="space-y-1">
                        <Label htmlFor="appr">Gebruikers moeten hun uren indienen per</Label>
                        <select id="appr" className={NATIVE_SELECT} value={s.approval_required} onChange={e => set({ approval_required: e.target.value })}>
                            <option value="none">Niet nodig (direct definitief)</option>
                            <option value="days">Dag</option>
                            <option value="workweeks">Werkweek (ma - vr)</option>
                            <option value="weeks">Week (ma - zo)</option>
                        </select>
                        <p className="text-xs text-muted-foreground">Ingediende uren zijn vergrendeld tot je ze goedkeurt of afkeurt bij Goedkeuringen.</p>
                    </div>
                </div>
            </div>
            <Button onClick={save} disabled={saving}>{saving ? 'Opslaan...' : 'Instellingen opslaan'}</Button>
        </div>
    );
}

/* ---------------- GEBRUIKERS ---------------- */
function UserRow({ u, entityId, projects, isSuperAdmin, currentUserId, onChanged }) {
    const [edit, setEdit] = useState({
        role: u.role || 'user',
        schedule_rotation_weeks: u.schedule_rotation_weeks || '',
        rotation_start_date: u.rotation_start_date || '',
        default_project_id: u.default_project_id || '',
        default_subject_id: u.default_subject_id || '',
    });
    const [dirty, setDirty] = useState(false);
    const change = (patch) => { setEdit({ ...edit, ...patch }); setDirty(true); };
    const subjects = projects.find(p => p.id === Number(edit.default_project_id))?.subjects || [];

    const save = async () => {
        try {
            await apiFetch(`/admin/users/${u.id}?entity_id=${entityId}`, {
                method: 'PUT',
                body: {
                    ...(u.id !== currentUserId ? { role: edit.role } : {}),
                    schedule_rotation_weeks: edit.schedule_rotation_weeks || null,
                    rotation_start_date: edit.rotation_start_date || '',
                    default_project_id: edit.default_project_id || null,
                    default_subject_id: edit.default_subject_id || null,
                },
            });
            setDirty(false);
            onChanged();
            if (u.id === currentUserId) refreshOwnData();
        } catch (err) { showError(err); }
    };

    const unlink = async () => {
        if (!confirm(`${u.username} loskoppelen van deze entiteit?`)) return;
        try {
            await apiFetch(`/admin/user-entities?entity_id=${entityId}&user_id=${u.id}`, { method: 'DELETE' });
            onChanged();
        } catch (err) { showError(err); }
    };

    return (
        <tr className="border-t align-top">
            <td className="py-2 pr-2">
                <div className="font-medium">{u.username}</div>
                {u.entities?.length > 1 && <div className="text-xs text-muted-foreground">{u.entities.map(e => e.name).join(', ')}</div>}
            </td>
            <td className="py-2 pr-2">
                <select className={`${NATIVE_SELECT} h-9 min-w-[130px]`} value={edit.role} disabled={u.id === currentUserId || (!isSuperAdmin && u.role === 'super_admin')} onChange={e => change({ role: e.target.value })}>
                    <option value="user">Werknemer</option>
                    <option value="entity_admin">Entiteit admin</option>
                    {(isSuperAdmin || u.role === 'super_admin') && <option value="super_admin">Super admin</option>}
                </select>
            </td>
            <td className="py-2 pr-2">
                <select className={`${NATIVE_SELECT} h-9 min-w-[120px]`} value={edit.schedule_rotation_weeks} onChange={e => change({ schedule_rotation_weeks: e.target.value ? Number(e.target.value) : '' })}>
                    <option value="">Standaard</option>
                    {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} {n === 1 ? 'week' : 'weken'}</option>)}
                </select>
                <Input type="date" className="h-9 mt-1" title="Een week die roosterweek 1 is" value={edit.rotation_start_date} onChange={e => change({ rotation_start_date: e.target.value })} />
            </td>
            <td className="py-2 pr-2">
                <select className={`${NATIVE_SELECT} h-9 min-w-[150px]`} value={edit.default_project_id} onChange={e => change({ default_project_id: e.target.value ? Number(e.target.value) : '', default_subject_id: '' })}>
                    <option value="">(geen vast project)</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {subjects.length > 0 && (
                    <select className={`${NATIVE_SELECT} h-9 mt-1`} value={edit.default_subject_id} onChange={e => change({ default_subject_id: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">(geen subject)</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                )}
            </td>
            <td className="py-2 text-right whitespace-nowrap">
                <Button size="sm" onClick={save} disabled={!dirty}>Opslaan</Button>
                {u.id !== currentUserId && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={unlink} title="Loskoppelen van deze entiteit">✕</Button>
                )}
            </td>
        </tr>
    );
}

function UsersPanel({ entityId, isSuperAdmin, currentUserId }) {
    const [users, setUsers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [form, setForm] = useState({ username: '', password: '', role: 'user' });
    const [linkName, setLinkName] = useState('');

    const load = useCallback(async () => {
        try {
            const [us, ps] = await Promise.all([
                apiFetch(`/admin/users?entity_id=${entityId}`),
                apiFetch(`/admin/projects?entity_id=${entityId}`),
            ]);
            const withSubjects = await Promise.all(ps.filter(p => p.is_active).map(async p => ({
                ...p,
                subjects: (await apiFetch(`/admin/subjects?project_id=${p.id}`)).filter(s => s.is_active),
            })));
            setUsers(us);
            setProjects(withSubjects);
        } catch (err) { showError(err); }
    }, [entityId]);

    useEffect(() => { load(); }, [load]);

    const create = async () => {
        try {
            await apiFetch(`/admin/users?entity_id=${entityId}`, { method: 'POST', body: { ...form, entity_id: entityId } });
            setForm({ username: '', password: '', role: 'user' });
            load();
        } catch (err) { showError(err); }
    };

    const link = async () => {
        if (!linkName.trim()) return;
        try {
            await apiFetch(`/admin/user-entities?entity_id=${entityId}`, { method: 'POST', body: { username: linkName.trim(), entity_id: entityId } });
            setLinkName('');
            load();
        } catch (err) { showError(err); }
    };

    return (
        <div className="space-y-6">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                            <th className="pb-2 pr-2 font-medium">Gebruiker</th>
                            <th className="pb-2 pr-2 font-medium">Rol</th>
                            <th className="pb-2 pr-2 font-medium">Rooster wisselt om de</th>
                            <th className="pb-2 pr-2 font-medium">Vast project / subject</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {users.length === 0 && <tr><td colSpan={5} className="py-3 text-muted-foreground italic">Nog geen gebruikers in deze entiteit.</td></tr>}
                        {users.map(u => (
                            <UserRow
                                key={`${u.id}-${u.default_project_id}-${u.default_subject_id}-${u.schedule_rotation_weeks}-${u.rotation_start_date}-${u.role}`}
                                u={u}
                                entityId={entityId}
                                projects={projects}
                                isSuperAdmin={isSuperAdmin}
                                currentUserId={currentUserId}
                                onChanged={load}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2 p-3 border rounded-lg">
                    <h3 className="font-semibold text-sm">Nieuwe gebruiker</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input placeholder="Gebruikersnaam" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                        <Input placeholder="Wachtwoord" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                        <select className={NATIVE_SELECT} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                            <option value="user">Werknemer</option>
                            <option value="entity_admin">Entiteit admin</option>
                            {isSuperAdmin && <option value="super_admin">Super admin</option>}
                        </select>
                    </div>
                    <Button onClick={create} disabled={!form.username || !form.password}>Gebruiker aanmaken</Button>
                </div>
                <div className="space-y-2 p-3 border rounded-lg">
                    <h3 className="font-semibold text-sm">Bestaande gebruiker toevoegen</h3>
                    <p className="text-xs text-muted-foreground">Een werknemer kan voor meerdere entiteiten werken. Hij kiest dan in het menu voor welke entiteit hij uren boekt.</p>
                    <div className="flex gap-2">
                        <Input placeholder="Gebruikersnaam" value={linkName} onChange={e => setLinkName(e.target.value)} />
                        <Button onClick={link}>Toevoegen</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------------- PROJECTEN ---------------- */
function ProjectsPanel({ entityId }) {
    const [projects, setProjects] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [selected, setSelected] = useState(null);
    const [newProject, setNewProject] = useState('');
    const [newSubject, setNewSubject] = useState('');

    const loadProjects = useCallback(() => apiFetch(`/admin/projects?entity_id=${entityId}`).then(setProjects).catch(showError), [entityId]);
    const loadSubjects = (pid) => apiFetch(`/admin/subjects?project_id=${pid}`).then(setSubjects).catch(showError);

    useEffect(() => { setSelected(null); setSubjects([]); loadProjects(); }, [loadProjects]);

    const after = () => refreshOwnData();

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
                <h3 className="font-semibold text-sm">Projecten</h3>
                <ul className="text-sm space-y-1 border rounded p-2 max-h-72 overflow-y-auto">
                    {projects.length === 0 && <li className="text-muted-foreground italic">Geen projecten</li>}
                    {projects.map(p => (
                        <li key={p.id} className={`flex justify-between items-center rounded px-1 ${selected === p.id ? 'bg-blue-50 dark:bg-blue-900/30' : ''} ${!p.is_active ? 'opacity-40' : ''}`}>
                            <button className="text-left hover:underline flex-1" onClick={() => { setSelected(p.id); loadSubjects(p.id); }}>{p.name}</button>
                            <div className="flex gap-2">
                                <button className="text-xs text-muted-foreground hover:text-primary" title={p.is_active ? 'Deactiveren' : 'Activeren'} onClick={async () => {
                                    await apiFetch(`/admin/projects/${p.id}`, { method: 'PUT', body: { name: p.name, is_active: p.is_active ? 0 : 1 } }).catch(showError);
                                    loadProjects(); after();
                                }}>{p.is_active ? '⏸' : '▶'}</button>
                                <button className="text-xs text-red-500 hover:text-red-700" title="Verwijderen" onClick={async () => {
                                    if (!confirm(`Project "${p.name}" verwijderen?`)) return;
                                    await apiFetch(`/admin/projects/${p.id}`, { method: 'DELETE' }).catch(showError);
                                    if (selected === p.id) { setSelected(null); setSubjects([]); }
                                    loadProjects(); after();
                                }}>✕</button>
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="flex gap-2">
                    <Input placeholder="Nieuw project" value={newProject} onChange={e => setNewProject(e.target.value)} />
                    <Button onClick={async () => {
                        if (!newProject.trim()) return;
                        await apiFetch(`/admin/projects?entity_id=${entityId}`, { method: 'POST', body: { name: newProject.trim(), entity_id: entityId } }).catch(showError);
                        setNewProject(''); loadProjects(); after();
                    }}>+</Button>
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="font-semibold text-sm">Subjecten {selected && `voor ${projects.find(p => p.id === selected)?.name}`}</h3>
                {!selected ? <p className="text-muted-foreground text-sm italic">Kies links een project.</p> : (
                    <>
                        <ul className="text-sm space-y-1 border rounded p-2 max-h-72 overflow-y-auto">
                            {subjects.length === 0 && <li className="text-muted-foreground italic">Geen subjecten</li>}
                            {subjects.map(s => (
                                <li key={s.id} className={`flex justify-between items-center ${!s.is_active ? 'opacity-40' : ''}`}>
                                    <span>{s.name}</span>
                                    <div className="flex gap-2">
                                        <button className="text-xs text-muted-foreground hover:text-primary" onClick={async () => {
                                            await apiFetch(`/admin/subjects/${s.id}`, { method: 'PUT', body: { name: s.name, is_active: s.is_active ? 0 : 1 } }).catch(showError);
                                            loadSubjects(selected); after();
                                        }}>{s.is_active ? '⏸' : '▶'}</button>
                                        <button className="text-xs text-red-500 hover:text-red-700" onClick={async () => {
                                            await apiFetch(`/admin/subjects/${s.id}`, { method: 'DELETE' }).catch(showError);
                                            loadSubjects(selected); after();
                                        }}>✕</button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="flex gap-2">
                            <Input placeholder="Nieuw subject" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
                            <Button onClick={async () => {
                                if (!newSubject.trim()) return;
                                await apiFetch('/admin/subjects', { method: 'POST', body: { project_id: selected, name: newSubject.trim() } }).catch(showError);
                                setNewSubject(''); loadSubjects(selected); after();
                            }}>+</Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ---------------- GOEDKEURINGEN ---------------- */
function ApprovalsPanel({ entityId }) {
    const [status, setStatus] = useState('submitted');
    const [list, setList] = useState([]);
    const [open, setOpen] = useState(null); // { id, registrations }
    const [comment, setComment] = useState('');

    const load = useCallback(() => apiFetch(`/admin/submissions?entity_id=${entityId}&status=${status}`).then(setList).catch(showError), [entityId, status]);
    useEffect(() => { setOpen(null); load(); }, [load]);

    const toggle = async (id) => {
        if (open?.id === id) { setOpen(null); return; }
        try {
            const data = await apiFetch(`/admin/submissions/${id}`);
            setOpen({ id, registrations: data.registrations });
            setComment('');
        } catch (err) { showError(err); }
    };

    const decide = async (id, decision) => {
        if (decision === 'rejected' && !comment.trim() && !confirm('Afkeuren zonder opmerking?')) return;
        try {
            await apiFetch(`/admin/submissions/${id}`, { method: 'PUT', body: { status: decision, comment } });
            setOpen(null);
            load();
        } catch (err) { showError(err); }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {[['submitted', 'Te beoordelen'], ['approved', 'Goedgekeurd'], ['rejected', 'Afgekeurd'], ['all', 'Alles']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setStatus(v)}
                        className={`px-3 py-1.5 rounded-md text-sm border ${status === v ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{l}</button>
                ))}
            </div>
            {list.length === 0 && <p className="text-sm text-muted-foreground italic">Niets te tonen.</p>}
            <div className="space-y-2">
                {list.map(s => (
                    <div key={s.id} className="border rounded-lg">
                        <button type="button" onClick={() => toggle(s.id)} className="w-full flex flex-wrap items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <span className="font-semibold">{s.username}</span>
                            <span className="text-sm capitalize">{periodText(s)}</span>
                            <span className="text-sm text-muted-foreground tabular-nums">{formatDuration(s.total_minutes)}</span>
                            <span className={`ml-auto text-xs px-2 py-0.5 rounded border ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                        </button>
                        {open?.id === s.id && (
                            <div className="p-3 border-t space-y-3">
                                <div className="space-y-1 max-h-72 overflow-y-auto">
                                    {open.registrations.length === 0 && <p className="text-sm italic text-muted-foreground">Geen registraties in deze periode.</p>}
                                    {open.registrations.map(r => (
                                        <div key={r.id} className={`flex flex-wrap gap-3 text-sm rounded border px-2 py-1 ${getTypeStyle(r.type)}`}>
                                            <span className="w-24 capitalize">{format(parseISO(r.date), 'EEE d MMM', { locale: nl })}</span>
                                            <span className="tabular-nums">{r.start} - {r.end}</span>
                                            <span className="font-medium capitalize">{r.type}</span>
                                            <span>{[r.project_name, r.subject_name].filter(Boolean).join(' › ')}</span>
                                            <span className="opacity-70 truncate">{r.description}</span>
                                        </div>
                                    ))}
                                </div>
                                {s.comment && <p className="text-sm"><b>Opmerking:</b> {s.comment}</p>}
                                {s.status === 'submitted' && (
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <Input placeholder="Opmerking (verplicht aan te raden bij afkeuren)" value={comment} onChange={e => setComment(e.target.value)} />
                                        <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => decide(s.id, 'approved')}>Goedkeuren</Button>
                                        <Button variant="destructive" onClick={() => decide(s.id, 'rejected')}>Afkeuren</Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ---------------- INTEGRATIES ---------------- */
function IntegrationsPanel({ entityId }) {
    const [s, setS] = useState(null);
    const [log, setLog] = useState([]);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [settings, l] = await Promise.all([
                apiFetch(`/admin/entity-settings?entity_id=${entityId}`),
                apiFetch(`/admin/webhook-log?entity_id=${entityId}`),
            ]);
            setS(settings);
            setLog(l);
        } catch (err) { showError(err); }
    }, [entityId]);
    useEffect(() => { setS(null); load(); }, [load]);

    if (!s) return <p className="text-sm text-muted-foreground">Laden...</p>;

    const save = async () => {
        setBusy(true);
        try {
            setS(await apiFetch(`/admin/entity-settings?entity_id=${entityId}`, {
                method: 'PUT',
                body: { webhook_url: s.webhook_url, webhook_secret: s.webhook_secret, webhook_mode: s.webhook_mode },
            }));
        } catch (err) { showError(err); }
        setBusy(false);
    };

    const test = async () => {
        setBusy(true);
        try {
            const res = await apiFetch(`/admin/webhook-test?entity_id=${entityId}`, { method: 'POST', body: { entity_id: entityId } });
            alert(res.error ? `Mislukt: ${res.error}` : `Gelukt (HTTP ${res.status_code})`);
            load();
        } catch (err) { showError(err); }
        setBusy(false);
    };

    const newKey = async () => {
        if (!confirm('Nieuwe API-sleutel maken? De oude sleutel werkt daarna niet meer.')) return;
        try {
            const res = await apiFetch(`/admin/api-key?entity_id=${entityId}`, { method: 'POST', body: { entity_id: entityId } });
            setS({ ...s, api_key: res.api_key });
        } catch (err) { showError(err); }
    };

    const base = new URL(API, window.location.href).href;
    const exportUrl = `${base}/export?key=${s.api_key}&from=${format(new Date(), 'yyyy-MM-01')}&to=${format(new Date(), 'yyyy-MM-dd')}`;
    const copy = (text) => navigator.clipboard?.writeText(text).then(() => alert('Gekopieerd'), () => prompt('Kopieer:', text));

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <h3 className="font-semibold">Webhook</h3>
                <p className="text-sm text-muted-foreground">
                    De app stuurt de uren (met project en subject) als JSON via HTTP POST naar deze URL, bijvoorbeeld naar je facturatie- of boekhoudpakket.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1 md:col-span-2">
                        <Label htmlFor="wh-url">URL</Label>
                        <Input id="wh-url" placeholder="https://..." value={s.webhook_url || ''} onChange={e => setS({ ...s, webhook_url: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="wh-mode">Versturen</Label>
                        <select id="wh-mode" className={NATIVE_SELECT} value={s.webhook_mode || 'off'} onChange={e => setS({ ...s, webhook_mode: e.target.value })}>
                            <option value="off">Uit</option>
                            <option value="realtime">Bij elke registratie (realtime)</option>
                            <option value="on_submit">Bij indienen</option>
                            <option value="on_approval">Bij goedkeuring</option>
                        </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                        <Label htmlFor="wh-secret">Geheime sleutel (optioneel)</Label>
                        <Input id="wh-secret" value={s.webhook_secret || ''} onChange={e => setS({ ...s, webhook_secret: e.target.value })} placeholder="Wordt gebruikt voor de X-Werkuren-Signature header" />
                    </div>
                </div>
                {(s.webhook_mode === 'on_submit' || s.webhook_mode === 'on_approval') && s.approval_required === 'none' && (
                    <p className="text-xs text-amber-700">Let op: indienen staat uit bij Instellingen, dus deze webhook wordt nooit verstuurd.</p>
                )}
                <div className="flex gap-2">
                    <Button onClick={save} disabled={busy}>Opslaan</Button>
                    <Button variant="outline" onClick={test} disabled={busy || !s.webhook_url}>Test versturen</Button>
                </div>
                {log.length > 0 && (
                    <div className="text-xs border rounded p-2 max-h-48 overflow-y-auto space-y-1">
                        {log.map(l => (
                            <div key={l.id} className="flex gap-3">
                                <span className="text-muted-foreground tabular-nums">{l.created_at}</span>
                                <span className="font-mono">{l.event}</span>
                                <span className={l.error ? 'text-red-600' : 'text-green-600'}>{l.error || `HTTP ${l.status_code}`}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <h3 className="font-semibold">Export-API</h3>
                <p className="text-sm text-muted-foreground">
                    Externe systemen kunnen de uren van deze entiteit ook zelf ophalen. Voeg <code>&status=approved</code> toe om enkel goedgekeurde uren te krijgen.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input readOnly value={s.api_key || ''} className="font-mono text-xs" />
                    <Button variant="outline" onClick={() => copy(s.api_key)}><Copy className="h-4 w-4 mr-1" /> Sleutel</Button>
                    <Button variant="outline" onClick={newKey}><RefreshCw className="h-4 w-4 mr-1" /> Nieuwe sleutel</Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input readOnly value={exportUrl} className="font-mono text-xs" />
                    <Button variant="outline" onClick={() => copy(exportUrl)}><Copy className="h-4 w-4 mr-1" /> Voorbeeld-URL</Button>
                </div>
            </div>
        </div>
    );
}

/* ---------------- PAGINA ---------------- */
const SECTIONS = [
    { key: 'settings', label: 'Instellingen', icon: Settings2 },
    { key: 'users', label: 'Gebruikers', icon: Users },
    { key: 'projects', label: 'Projecten', icon: FolderKanban },
    { key: 'approvals', label: 'Goedkeuringen', icon: CheckSquare },
    { key: 'integrations', label: 'Integraties', icon: Webhook },
];

export default function Admin() {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'super_admin';
    const isAdmin = isSuperAdmin || user?.role === 'entity_admin';

    const [companies, setCompanies] = useState([]);
    const [entities, setEntities] = useState([]);
    const [entityId, setEntityId] = useState(null);
    const [section, setSection] = useState('settings');
    const [newCompany, setNewCompany] = useState('');
    const [newEntity, setNewEntity] = useState({ name: '', company_id: '' });

    const load = useCallback(async () => {
        try {
            const [ents, comps] = await Promise.all([
                apiFetch('/admin/entities'),
                isSuperAdmin ? apiFetch('/admin/companies') : Promise.resolve([]),
            ]);
            setEntities(ents);
            setCompanies(comps);
            setEntityId(prev => (ents.some(e => e.id === prev) ? prev : (ents.find(e => e.id === user?.entity_id)?.id ?? ents[0]?.id ?? null)));
        } catch (err) { showError(err); }
    }, [isSuperAdmin, user?.entity_id]);

    useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

    if (!isAdmin) {
        return <div className="p-4 text-red-500">Geen toegang. Je hebt admin rechten nodig.</div>;
    }

    const addCompany = async () => {
        if (!newCompany.trim()) return;
        try {
            await apiFetch('/admin/companies', { method: 'POST', body: { name: newCompany.trim() } });
            setNewCompany('');
            load();
        } catch (err) { showError(err); }
    };

    const addEntity = async () => {
        if (!newEntity.name.trim() || !newEntity.company_id) return;
        try {
            const created = await apiFetch('/admin/entities', { method: 'POST', body: { name: newEntity.name.trim(), company_id: Number(newEntity.company_id) } });
            setNewEntity({ name: '', company_id: newEntity.company_id });
            await load();
            setEntityId(created.id);
        } catch (err) { showError(err); }
    };

    const activeEntity = entities.find(e => e.id === entityId);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Admin Dashboard</h2>
                <p className="text-muted-foreground">Beheer bedrijven, entiteiten, gebruikers, projecten en goedkeuringen.</p>
            </div>

            {isSuperAdmin && (
                <Card>
                    <CardHeader>
                        <CardTitle>Bedrijven & entiteiten</CardTitle>
                        <CardDescription>Een bedrijf kan meerdere entiteiten hebben (vestigingen, afdelingen). Instellingen gelden per entiteit.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <ul className="text-sm space-y-1">
                                {companies.map(c => (
                                    <li key={c.id}>
                                        <span className="font-medium">{c.name}</span>
                                        <span className="text-muted-foreground"> — {entities.filter(e => e.company_id === c.id).map(e => e.name).join(', ') || 'geen entiteiten'}</span>
                                    </li>
                                ))}
                                {companies.length === 0 && <li className="italic text-muted-foreground">Nog geen bedrijven</li>}
                            </ul>
                            <div className="flex gap-2">
                                <Input placeholder="Nieuw bedrijf" value={newCompany} onChange={e => setNewCompany(e.target.value)} />
                                <Button onClick={addCompany}>Toevoegen</Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <select className={NATIVE_SELECT} value={newEntity.company_id} onChange={e => setNewEntity({ ...newEntity, company_id: e.target.value })}>
                                <option value="">Kies bedrijf...</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <div className="flex gap-2">
                                <Input placeholder="Nieuwe entiteit" value={newEntity.name} onChange={e => setNewEntity({ ...newEntity, name: e.target.value })} />
                                <Button onClick={addEntity} disabled={!newEntity.company_id}>Toevoegen</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {entities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {isSuperAdmin ? 'Maak eerst een bedrijf en een entiteit aan.' : 'Je bent nog aan geen entiteit gekoppeld.'}
                </p>
            ) : (
                <Card>
                    <CardHeader className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <CardTitle className="shrink-0">Entiteit</CardTitle>
                            <select className={`${NATIVE_SELECT} sm:max-w-sm`} value={entityId ?? ''} onChange={e => setEntityId(Number(e.target.value))}>
                                {entities.map(e => <option key={e.id} value={e.id}>{e.company_name ? `${e.company_name} - ` : ''}{e.name}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-wrap gap-1 border-b">
                            {SECTIONS.map(({ key, label, icon }) => {
                                const SectionIcon = icon;
                                return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setSection(key)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${section === key
                                        ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                                >
                                    <SectionIcon className="h-4 w-4" /> {label}
                                </button>
                                );
                            })}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {activeEntity && section === 'settings' && <SettingsPanel entityId={entityId} />}
                        {activeEntity && section === 'users' && <UsersPanel entityId={entityId} isSuperAdmin={isSuperAdmin} currentUserId={user?.id} />}
                        {activeEntity && section === 'projects' && <ProjectsPanel entityId={entityId} />}
                        {activeEntity && section === 'approvals' && <ApprovalsPanel entityId={entityId} />}
                        {activeEntity && section === 'integrations' && <IntegrationsPanel entityId={entityId} />}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
