import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAdminStore } from '../store/useAdminStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export default function Admin() {
    const { user } = useAuth();
    const { companies, entities, users, entitySettings, fetchSuperAdminData, fetchEntityAdminData, createCompany, createEntity, createUser, updateEntitySettings } = useAdminStore();
    
    const isSuperAdmin = user?.role === 'super_admin';
    
    const [newCompName, setNewCompName] = useState('');
    const [newEntName, setNewEntName] = useState('');
    const [newEntCompId, setNewEntCompId] = useState('');
    
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('user');
    const [newUserEntityId, setNewUserEntityId] = useState(user?.entity_id || '');

    const [settingsState, setSettingsState] = useState(null);
    const [projects, setProjects] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [newProjectName, setNewProjectName] = useState('');
    const [newSubjectName, setNewSubjectName] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');

    const API = window.location.hostname !== 'localhost' ? './api.php' : 'http://localhost:3001/api';
    const authH = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('wt')}` });

    const fetchProjects = async (entityId) => {
        const url = entityId ? `${API}/admin/projects?entity_id=${entityId}` : `${API}/admin/projects`;
        const res = await fetch(url, { headers: authH() });
        setProjects(await res.json());
    };

    const fetchSubjects = async (projectId) => {
        const res = await fetch(`${API}/admin/subjects?project_id=${projectId}`, { headers: authH() });
        setSubjects(await res.json());
    };

    useEffect(() => {
        if (isSuperAdmin) {
            fetchSuperAdminData();
            fetchEntityAdminData();
        } else if (user?.role === 'entity_admin') {
            fetchEntityAdminData();
        }
    }, [user]);

    useEffect(() => {
        if (entitySettings) {
            setSettingsState(entitySettings);
        }
    }, [entitySettings]);

    useEffect(() => {
        if (user) fetchProjects(user.entity_id);
    }, [user]);

    if (user?.role !== 'super_admin' && user?.role !== 'entity_admin') {
        return <div className="p-4 text-red-500">Geen toegang. Je hebt admin rechten nodig.</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Admin Dashboard</h2>
                <p className="text-muted-foreground">Beheer bedrijven, entiteiten en instellingen.</p>
            </div>

            {isSuperAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Bedrijven</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ul className="list-disc pl-5 mb-4">
                                {companies.map(c => <li key={c.id}>{c.name}</li>)}
                            </ul>
                            <div className="flex gap-2">
                                <Input placeholder="Nieuw bedrijf" value={newCompName} onChange={e => setNewCompName(e.target.value)} />
                                <Button onClick={() => { createCompany(newCompName); setNewCompName(''); }}>Toevoegen</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Entiteiten</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ul className="list-disc pl-5 mb-4">
                                {entities.map(e => <li key={e.id}>{e.name} ({e.company_name})</li>)}
                            </ul>
                            <div className="flex flex-col gap-2">
                                <Select value={newEntCompId} onValueChange={setNewEntCompId}>
                                    <SelectTrigger><SelectValue placeholder="Kies bedrijf" /></SelectTrigger>
                                    <SelectContent>
                                        {companies.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Input placeholder="Nieuwe entiteit" value={newEntName} onChange={e => setNewEntName(e.target.value)} />
                                <Button onClick={() => { createEntity(newEntName, newEntCompId); setNewEntName(''); }}>Toevoegen</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Gebruikers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <ul className="list-disc pl-5 mb-4">
                        {users.map(u => <li key={u.id}>{u.username} ({u.role}) - Entiteit: {u.entity_id || 'Geen'}</li>)}
                    </ul>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                        <Input placeholder="Gebruikersnaam" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
                        <Input placeholder="Wachtwoord" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                        
                        <Select value={newUserRole} onValueChange={setNewUserRole}>
                            <SelectTrigger><SelectValue placeholder="Rol" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">Werknemer</SelectItem>
                                <SelectItem value="entity_admin">Entiteit Admin</SelectItem>
                                {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                            </SelectContent>
                        </Select>

                        {isSuperAdmin && (
                            <Select value={newUserEntityId} onValueChange={setNewUserEntityId}>
                                <SelectTrigger><SelectValue placeholder="Kies entiteit" /></SelectTrigger>
                                <SelectContent>
                                    {entities.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                        
                        <Button onClick={() => {
                            createUser({ username: newUsername, password: newPassword, role: newUserRole, entity_id: newUserEntityId });
                            setNewUsername(''); setNewPassword('');
                        }}>Gebruiker Aanmaken</Button>
                    </div>
                </CardContent>
            </Card>

            {settingsState && (
                <Card>
                    <CardHeader>
                        <CardTitle>Entiteit Instellingen</CardTitle>
                        <CardDescription>Deze instellingen gelden als standaard voor alle gebruikers in deze entiteit.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Kortste Tijdseenheid (minuten)</Label>
                            <Select value={settingsState.time_step.toString()} onValueChange={v => setSettingsState({...settingsState, time_step: parseInt(v)})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5">5</SelectItem>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="15">15</SelectItem>
                                    <SelectItem value="30">30</SelectItem>
                                    <SelectItem value="60">60</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <div className="space-y-2 flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                checked={settingsState.allow_deviate_time_step} 
                                onChange={e => setSettingsState({...settingsState, allow_deviate_time_step: e.target.checked ? 1 : 0})} 
                            />
                            <Label>Gebruikers mogen afwijken van de kortste tijdseenheid</Label>
                        </div>

                        <div className="space-y-2">
                            <Label>Roterend uurrooster (weken)</Label>
                            <Select value={settingsState.schedule_rotation_weeks?.toString()} onValueChange={v => setSettingsState({...settingsState, schedule_rotation_weeks: parseInt(v)})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 week (vast)</SelectItem>
                                    <SelectItem value="2">2 weken</SelectItem>
                                    <SelectItem value="3">3 weken</SelectItem>
                                    <SelectItem value="4">4 weken</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Goedkeuringsflow</Label>
                            <Select value={settingsState.approval_required} onValueChange={v => setSettingsState({...settingsState, approval_required: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Geen (direct definitief)</SelectItem>
                                    <SelectItem value="days">Dagen indienen</SelectItem>
                                    <SelectItem value="weeks">Weken indienen</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Registratietypes (komma gescheiden)</Label>
                            <Input 
                                placeholder="Werk,Pauze,Ziekte,Verlof" 
                                value={settingsState.custom_registration_types || ''} 
                                onChange={e => setSettingsState({...settingsState, custom_registration_types: e.target.value})} 
                            />
                            <p className="text-xs text-muted-foreground">Laat leeg of gebruik "Werk,Pauze,Ziekte,Verlof" voor standaard.</p>
                        </div>

                        <div className="space-y-2 flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                checked={settingsState.auto_split_overtime} 
                                onChange={e => setSettingsState({...settingsState, auto_split_overtime: e.target.checked ? 1 : 0})} 
                            />
                            <Label>Registraties buiten rooster automatisch afsplitsen naar "Overuur"</Label>
                        </div>

                        <Button onClick={() => updateEntitySettings(settingsState)}>Instellingen Opslaan</Button>
                    </CardContent>
                </Card>
            )}

            {/* PROJECTS & SUBJECTS */}
            <Card>
                <CardHeader>
                    <CardTitle>Projecten & Subjecten</CardTitle>
                    <CardDescription>Beheer projecten en bijhorende subjecten per entiteit.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Projects column */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-sm">Projecten</h3>
                            <ul className="text-sm space-y-1 border rounded p-2 max-h-40 overflow-y-auto">
                                {projects.length === 0 && <li className="text-muted-foreground italic">Geen projecten</li>}
                                {projects.map(p => (
                                    <li key={p.id} className={`flex justify-between items-center ${!p.is_active ? 'opacity-40' : ''}`}>
                                        <button className="text-left hover:underline" onClick={() => { setSelectedProjectId(p.id.toString()); fetchSubjects(p.id); }}>
                                            {p.name}
                                        </button>
                                        <div className="flex gap-1">
                                            <button className="text-xs text-muted-foreground hover:text-primary" onClick={async () => {
                                                await fetch(`${API}/admin/projects/${p.id}`, { method: 'PUT', headers: authH(), body: JSON.stringify({ name: p.name, is_active: p.is_active ? 0 : 1 }) });
                                                fetchProjects(user.entity_id);
                                            }}>{p.is_active ? '⏸' : '▶'}</button>
                                            <button className="text-xs text-red-500 hover:text-red-700" onClick={async () => {
                                                if (confirm(`Project "${p.name}" verwijderen?`)) {
                                                    await fetch(`${API}/admin/projects/${p.id}`, { method: 'DELETE', headers: authH() });
                                                    fetchProjects(user.entity_id);
                                                    setSubjects([]);
                                                }
                                            }}>✕</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <div className="flex gap-2">
                                <Input placeholder="Nieuw project" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
                                <Button onClick={async () => {
                                    if (!newProjectName) return;
                                    await fetch(`${API}/admin/projects`, { method: 'POST', headers: authH(), body: JSON.stringify({ name: newProjectName, entity_id: user.entity_id }) });
                                    setNewProjectName('');
                                    fetchProjects(user.entity_id);
                                }}>+</Button>
                            </div>
                        </div>

                        {/* Subjects column */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-sm">Subjecten {selectedProjectId && `(voor project ${projects.find(p => p.id == selectedProjectId)?.name})`}</h3>
                            {!selectedProjectId && <p className="text-muted-foreground text-sm italic">Kies een project links om subjecten te beheren.</p>}
                            {selectedProjectId && (
                                <>
                                    <ul className="text-sm space-y-1 border rounded p-2 max-h-40 overflow-y-auto">
                                        {subjects.length === 0 && <li className="text-muted-foreground italic">Geen subjecten</li>}
                                        {subjects.map(s => (
                                            <li key={s.id} className={`flex justify-between items-center ${!s.is_active ? 'opacity-40' : ''}`}>
                                                <span>{s.name}</span>
                                                <div className="flex gap-1">
                                                    <button className="text-xs text-muted-foreground hover:text-primary" onClick={async () => {
                                                        await fetch(`${API}/admin/subjects/${s.id}`, { method: 'PUT', headers: authH(), body: JSON.stringify({ name: s.name, is_active: s.is_active ? 0 : 1 }) });
                                                        fetchSubjects(selectedProjectId);
                                                    }}>{s.is_active ? '⏸' : '▶'}</button>
                                                    <button className="text-xs text-red-500 hover:text-red-700" onClick={async () => {
                                                        await fetch(`${API}/admin/subjects/${s.id}`, { method: 'DELETE', headers: authH() });
                                                        fetchSubjects(selectedProjectId);
                                                    }}>✕</button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex gap-2">
                                        <Input placeholder="Nieuw subject" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} />
                                        <Button onClick={async () => {
                                            if (!newSubjectName) return;
                                            await fetch(`${API}/admin/subjects`, { method: 'POST', headers: authH(), body: JSON.stringify({ project_id: parseInt(selectedProjectId), name: newSubjectName }) });
                                            setNewSubjectName('');
                                            fetchSubjects(selectedProjectId);
                                        }}>+</Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
