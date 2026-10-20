import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { formatTime, withValue } from '../lib/time';
import { averageWeeklyHours, cycleWeekIndex, plannedMinutes, MAX_ROTATION_WEEKS } from '../lib/schedule';
import { NATIVE_SELECT, formatDuration } from '../lib/ui';

export const generateTimeOptions = (step = 30) => {
    const options = [];
    for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 60; j += step) {
            options.push(`${String(i).padStart(2, '0')}:${String(j).padStart(2, '0')}`);
        }
    }
    return options;
};

const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
const SMALL_SELECT = 'flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

export default function Settings() {
    const { user } = useAuth();
    const {
        baseSchedule, updateBaseSchedule, employeeStartDate, setEmployeeStartDate, country, setCountry,
        timeStep, timeStepLocked, setTimeStep, scheduleRotationWeeks, userRotationWeeks, rotationStartDate, setRotation,
        entities, activeEntity,
    } = useStore();

    const rotation = scheduleRotationWeeks || 2;
    const canChooseRotation = entities.length === 0 || user?.role === 'super_admin' || user?.role === 'entity_admin';
    const currentCycleWeek = cycleWeekIndex(new Date(), rotation, rotationStartDate);
    const [weekTab, setWeekTab] = useState(currentCycleWeek);
    const visibleWeek = Math.min(weekTab, rotation - 1);

    const TIME_OPTIONS = useMemo(() => generateTimeOptions(timeStep || 30), [timeStep]);
    const avgHours = averageWeeklyHours(baseSchedule, rotation);

    const handleTimeChange = (index, field, value) => {
        updateBaseSchedule(index, { ...baseSchedule[index], [field]: value });
    };

    const copyWeekOne = () => {
        if (!confirm(`Week 1 overnemen in week ${visibleWeek + 1}?`)) return;
        for (let d = 0; d < 7; d++) {
            updateBaseSchedule(visibleWeek * 7 + d, { ...baseSchedule[d] });
        }
    };

    const weekDays = baseSchedule.slice(visibleWeek * 7, visibleWeek * 7 + 7);
    const weekMinutes = weekDays.reduce((sum, d) => sum + plannedMinutes(d), 0);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Instellingen</h2>
                <p className="text-muted-foreground">Je persoonlijke gegevens en je basisrooster.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Gegevens werknemer</CardTitle>
                    <CardDescription>Startdatum, land voor de feestdagen en de kleinste tijdseenheid.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="startdate">Startdatum in dienst</Label>
                            <Input type="date" id="startdate" value={employeeStartDate} onChange={(e) => setEmployeeStartDate(e.target.value)} />
                            {employeeStartDate && (
                                <p className="text-xs text-muted-foreground">
                                    Rapportage start op {new Date(employeeStartDate).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="country">Land (voor feestdagen)</Label>
                            <select id="country" className={NATIVE_SELECT} value={country} onChange={(e) => setCountry(e.target.value)}>
                                <option value="BE">België</option>
                                <option value="NL">Nederland</option>
                                <option value="DE">Duitsland</option>
                                <option value="FR">Frankrijk</option>
                                <option value="LU">Luxemburg</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="timestep">Kleinste tijdseenheid</Label>
                            <select
                                id="timestep"
                                className={NATIVE_SELECT}
                                value={timeStep || 30}
                                disabled={timeStepLocked}
                                onChange={(e) => setTimeStep(Number(e.target.value))}
                            >
                                {[5, 10, 15, 30, 60].map(v => <option key={v} value={v}>{v} minuten</option>)}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                {timeStepLocked
                                    ? `Vastgelegd door je admin${activeEntity ? ` (${activeEntity.name})` : ''}.`
                                    : 'Bepaalt de kleinste stap in de kalender en de keuzelijsten.'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Basisrooster</CardTitle>
                    <CardDescription>
                        Dit rooster wordt gebruikt om weken in te vullen, overuren af te splitsen en je saldo te berekenen.
                        Vink een dag uit als je dan niet werkt.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Rotatie */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded-lg border bg-slate-50 dark:bg-slate-800/40">
                        <div className="space-y-2">
                            <Label htmlFor="rotation">Rooster wisselt om de</Label>
                            {canChooseRotation ? (
                                <select
                                    id="rotation"
                                    className={NATIVE_SELECT}
                                    value={userRotationWeeks || ''}
                                    onChange={(e) => setRotation(e.target.value ? Number(e.target.value) : null)}
                                >
                                    <option value="">Standaard ({activeEntity?.settings?.scheduleRotationWeeks || 2} {(activeEntity?.settings?.scheduleRotationWeeks || 2) === 1 ? 'week' : 'weken'})</option>
                                    {Array.from({ length: MAX_ROTATION_WEEKS }, (_, i) => i + 1).map(n => (
                                        <option key={n} value={n}>{n === 1 ? '1 week (vast rooster)' : `${n} weken`}</option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-sm font-medium pt-2">
                                    {rotation === 1 ? '1 week (vast rooster)' : `${rotation} weken`}
                                    <span className="block text-xs font-normal text-muted-foreground">Ingesteld door je admin.</span>
                                </p>
                            )}
                        </div>
                        {rotation > 1 && (
                            <div className="space-y-2">
                                <Label htmlFor="rotation-start">Een week die "week 1" is</Label>
                                <Input
                                    id="rotation-start"
                                    type="date"
                                    value={rotationStartDate}
                                    disabled={!canChooseRotation}
                                    onChange={(e) => setRotation(userRotationWeeks, e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">Deze week is nu roosterweek {currentCycleWeek + 1}.</p>
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label>Gemiddeld per week</Label>
                            <p className="text-2xl font-bold tabular-nums">{avgHours.toFixed(2).replace('.', ',')} u</p>
                            {country === 'BE' && avgHours > 38 && (
                                <p className="text-xs text-red-600">Meer dan 38 uur gemiddeld: kijk na of dit klopt met je arbeidsreglement.</p>
                            )}
                        </div>
                        <p className="md:col-span-3 text-xs text-muted-foreground">
                            Bij een wisselend (cyclisch) rooster moet het gemiddelde over de hele cyclus binnen de afgesproken wekelijkse arbeidsduur blijven
                            {country === 'BE' ? ' (in België standaard maximaal 38 uur)' : ''}, en hoort het rooster in het arbeidsreglement te staan.
                            Laat het bij twijfel nakijken door je sociaal secretariaat.
                        </p>
                    </div>

                    {/* Weektabs */}
                    {rotation > 1 && (
                        <div className="flex flex-wrap items-center gap-2">
                            {Array.from({ length: rotation }, (_, w) => (
                                <button
                                    key={w}
                                    type="button"
                                    onClick={() => setWeekTab(w)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${visibleWeek === w
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                >
                                    Week {w + 1}{w === currentCycleWeek ? ' (nu)' : ''}
                                </button>
                            ))}
                            {visibleWeek > 0 && (
                                <Button type="button" variant="outline" size="sm" onClick={copyWeekOne}>Week 1 overnemen</Button>
                            )}
                            <span className="ml-auto text-sm text-muted-foreground">Week {visibleWeek + 1}: {formatDuration(weekMinutes)}</span>
                        </div>
                    )}

                    <div className="space-y-3">
                        {weekDays.map((day, d) => {
                            const index = visibleWeek * 7 + d;
                            return (
                                <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg border bg-card">
                                    <div className="flex items-center gap-3 w-40">
                                        <input
                                            type="checkbox"
                                            checked={!!day.active}
                                            onChange={() => handleTimeChange(index, 'active', !day.active)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            id={`day-${index}`}
                                        />
                                        <Label htmlFor={`day-${index}`} className="font-medium cursor-pointer">{DAY_NAMES[d]}</Label>
                                    </div>

                                    {day.active ? (
                                        <div className="flex flex-col sm:flex-row gap-4 flex-1">
                                            <div className="flex items-center gap-2">
                                                <select className={`${SMALL_SELECT} w-[100px]`} value={formatTime(day.start)} onChange={(e) => handleTimeChange(index, 'start', e.target.value)}>
                                                    {withValue(TIME_OPTIONS, day.start).map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                                <span className="text-muted-foreground text-sm">tot</span>
                                                <select className={`${SMALL_SELECT} w-[100px]`} value={formatTime(day.end)} onChange={(e) => handleTimeChange(index, 'end', e.target.value)}>
                                                    {withValue(TIME_OPTIONS, day.end).map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>

                                            <div className="flex items-center gap-3 sm:border-l sm:pl-4 border-slate-200 dark:border-slate-700">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={day.hasBreak || false}
                                                        onChange={(e) => handleTimeChange(index, 'hasBreak', e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        id={`break-${index}`}
                                                    />
                                                    <Label htmlFor={`break-${index}`} className="font-medium cursor-pointer text-sm">Pauze</Label>
                                                </div>
                                                {day.hasBreak && (
                                                    <div className="flex items-center gap-1">
                                                        <select className={`${SMALL_SELECT} w-[90px] text-xs`} value={formatTime(day.breakStart || '12:00')} onChange={(e) => handleTimeChange(index, 'breakStart', e.target.value)}>
                                                            {withValue(TIME_OPTIONS, day.breakStart || '12:00').map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                        <select className={`${SMALL_SELECT} w-[90px] text-xs`} value={formatTime(day.breakEnd || '12:30')} onChange={(e) => handleTimeChange(index, 'breakEnd', e.target.value)}>
                                                            {withValue(TIME_OPTIONS, day.breakEnd || '12:30').map(t => <option key={t} value={t}>{t}</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                            <span className="sm:ml-auto text-sm text-muted-foreground tabular-nums self-center">{formatDuration(plannedMinutes(day))}</span>
                                        </div>
                                    ) : (
                                        <span className="text-sm text-muted-foreground italic flex-1">Vrije dag</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
