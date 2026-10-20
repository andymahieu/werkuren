import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
    startOfWeek,
    addDays,
    subDays,
    format,
    subWeeks,
    addWeeks,
    getISOWeek,
    isSameDay,
    parseISO,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Copy, Split, CalendarCheck, Lock, Send, CheckCircle2, Undo2, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

import { generateTimeOptions } from './Settings';
import { formatTime, toMinutes, toTime, withValue } from '../lib/time';
import { getScheduleForDate, cycleWeekIndex, plannedMinutes, isNonProjectType, isBreakType } from '../lib/schedule';
import { NATIVE_SELECT, formatDuration, getTypeStyle, isLockedStatus, STATUS_LABEL, STATUS_STYLE } from '../lib/ui';

const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 18;

export default function Planner({ mode = 'week' }) {
    const isDay = mode === 'day';
    const isWorkweek = mode === 'workweek';
    const location = useLocation();
    const navigate = useNavigate();

    const [currentDate, setCurrentDate] = useState(() => {
        const fromState = location.state?.date;
        return fromState ? parseISO(fromState) : new Date();
    });
    const {
        registrations, baseSchedule, holidays, addRegistration, addRegistrations, updateRegistration, deleteRegistration,
        timeStep, customRegistrationTypes, autoSplitOvertime, allowManualSplitOvertime,
        scheduleRotationWeeks, rotationStartDate, entities, activeEntityId, projectMode,
        defaultProjectId, defaultSubjectId, approvalRequired, submissions, submitPeriod, withdrawSubmission,
    } = useStore();
    const [autoFilledWeeks, setAutoFilledWeeks] = useState(new Set());

    const step = timeStep || 30;
    const TIME_SLOTS = useMemo(() => generateTimeOptions(step), [step]);
    const pixelsPerMinute = 1.6; // 48px voor 30 minuten
    const slotHeight = step * pixelsPerMinute;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        start: '08:00',
        end: '17:00',
        type: 'werk',
        description: '',
        entity_id: activeEntityId,
        project_id: null,
        subject_id: null,
    });

    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // maandag
    const weekNumber = getISOWeek(startDate);
    const rotation = scheduleRotationWeeks || 2;
    const cycleWeek = cycleWeekIndex(startDate, rotation, rotationStartDate) + 1;

    const daysThisWeek = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
    }, [startDate.getTime()]);

    const visibleDays = isDay ? [currentDate] : (isWorkweek ? daysThisWeek.slice(0, 5) : daysThisWeek);

    const getScheduleForDay = (day) => getScheduleForDate(day, baseSchedule, rotation, rotationStartDate);

    // ---- Indienen / goedkeuring ----
    const findSubmission = (dateStr) => {
        const matches = submissions.filter(s => s.entity_id === activeEntityId && s.period_start <= dateStr && s.period_end >= dateStr);
        return matches.find(s => s.status !== 'rejected') || matches[0] || null;
    };
    const isDateLocked = (dateStr) => {
        const sub = findSubmission(dateStr);
        return !!sub && sub.status !== 'rejected';
    };

    const periodFor = (day) => {
        const monday = startOfWeek(day, { weekStartsOn: 1 });
        if (approvalRequired === 'days') return { type: 'day', start: day, end: day, label: 'dag' };
        if (approvalRequired === 'workweeks') return { type: 'workweek', start: monday, end: addDays(monday, 4), label: 'werkweek' };
        return { type: 'week', start: monday, end: addDays(monday, 6), label: 'week' };
    };

    const handleSubmitPeriod = async (day) => {
        const p = periodFor(day);
        const start = format(p.start, 'yyyy-MM-dd');
        const end = format(p.end, 'yyyy-MM-dd');
        const range = p.type === 'day'
            ? format(p.start, 'EEEE d MMMM', { locale: nl })
            : `${format(p.start, 'd MMM', { locale: nl })} - ${format(p.end, 'd MMM', { locale: nl })}`;
        if (!confirm(`De ${p.label} van ${range} indienen ter goedkeuring?\nNa het indienen kun je deze uren niet meer wijzigen.`)) return;
        await submitPeriod(p.type, start, end);
    };

    const handleWithdraw = async (sub) => {
        if (!confirm('Indiening intrekken? Je kunt de uren daarna weer aanpassen.')) return;
        await withdrawSubmission(sub.id);
    };

    // Zichtbaar uurbereik: standaard 06:00-18:00, uitgebreid als er vroegere/latere uren zijn
    const { startHour, endHour } = useMemo(() => {
        let minH = DEFAULT_START_HOUR;
        let maxH = DEFAULT_END_HOUR;
        visibleDays.forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            registrations.filter(r => r.date === dateStr).forEach(r => {
                minH = Math.min(minH, Math.floor(toMinutes(r.start) / 60));
                maxH = Math.max(maxH, Math.ceil(toMinutes(r.end) / 60));
            });
            const ds = getScheduleForDay(day);
            if (ds && ds.active) {
                minH = Math.min(minH, Math.floor(toMinutes(ds.start) / 60));
                maxH = Math.max(maxH, Math.ceil(toMinutes(ds.end) / 60));
            }
        });
        return { startHour: Math.max(0, minH), endHour: Math.min(24, maxH) };
    }, [registrations, baseSchedule, mode, currentDate.getTime(), rotation, rotationStartDate]);

    const VISIBLE_SLOTS = useMemo(
        () => TIME_SLOTS.filter(t => {
            const h = parseInt(t.split(':')[0], 10);
            return h >= startHour && h < endHour;
        }),
        [TIME_SLOTS, startHour, endHour]
    );

    const needsProject = projectMode !== 'off';
    const projectRequired = projectMode === 'required';
    const canAutoFill = !(projectRequired && !defaultProjectId);

    const projectDefaults = () => (needsProject ? { project_id: defaultProjectId, subject_id: defaultSubjectId } : { project_id: null, subject_id: null });

    // Automatisch rooster invullen als een week nog volledig leeg is
    useEffect(() => {
        const weekKey = format(startDate, 'yyyy-MM-dd');
        if (autoFilledWeeks.has(weekKey)) return;

        const hasAnyRegThisWeek = registrations.some(r => {
            const rDate = parseISO(r.date);
            return rDate >= startDate && rDate < addDays(startDate, 7);
        });

        if (!hasAnyRegThisWeek && baseSchedule.length > 0 && canAutoFill) {
            handleFill(daysThisWeek, true);
            setAutoFilledWeeks(prev => new Set(prev).add(weekKey));
        }
    }, [startDate.getTime(), registrations, baseSchedule]);

    const handleFill = (days, silent = false) => {
        if (!canAutoFill) {
            if (!silent) alert('Je admin heeft projectregistratie verplicht gemaakt en je hebt nog geen standaardproject. Voeg de uren manueel toe.');
            return;
        }
        const newRegs = [];
        const extra = { entity_id: activeEntityId, ...projectDefaults() };
        days.forEach((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            if (registrations.some(r => r.date === dateStr) || isDateLocked(dateStr)) return;
            const ds = getScheduleForDay(day);
            if (!ds || !ds.active) return;
            if (ds.hasBreak && ds.breakStart && ds.breakEnd) {
                newRegs.push({ date: dateStr, start: formatTime(ds.start), end: formatTime(ds.breakStart), type: 'werk', description: 'Voor de middag', ...extra });
                newRegs.push({ date: dateStr, start: formatTime(ds.breakStart), end: formatTime(ds.breakEnd), type: 'pauze', description: 'Pauze', entity_id: activeEntityId });
                newRegs.push({ date: dateStr, start: formatTime(ds.breakEnd), end: formatTime(ds.end), type: 'werk', description: 'Na de middag', ...extra });
            } else {
                newRegs.push({ date: dateStr, start: formatTime(ds.start), end: formatTime(ds.end), type: 'werk', description: 'Basisrooster', ...extra });
            }
        });

        if (newRegs.length > 0) {
            addRegistrations(newRegs);
        } else if (!silent) {
            alert(isDay
                ? 'Er zijn al uren ingevuld op deze dag of het is geen actieve dag in het basisrooster.'
                : 'Er zijn al uren ingevuld of er zijn geen actieve dagen in het basisrooster voor deze week.');
        }
    };

    // Splits werkuren buiten het rooster af naar 'Overuur'
    const splitSegments = (reg, ds) => {
        if (!ds || !ds.active) return [{ ...reg, type: 'Overuur' }];
        const regStart = toMinutes(reg.start);
        const regEnd = toMinutes(reg.end);
        const schedStart = toMinutes(ds.start);
        const schedEnd = toMinutes(ds.end);
        const segments = [];
        if (regStart < schedStart) {
            segments.push({ ...reg, start: toTime(regStart), end: toTime(Math.min(regEnd, schedStart)), type: 'Overuur' });
        }
        if (regEnd > schedStart && regStart < schedEnd) {
            segments.push({ ...reg, start: toTime(Math.max(regStart, schedStart)), end: toTime(Math.min(regEnd, schedEnd)), type: reg.type });
        }
        if (regEnd > schedEnd) {
            segments.push({ ...reg, start: toTime(Math.max(regStart, schedEnd)), end: toTime(regEnd), type: 'Overuur' });
        }
        return segments;
    };

    const handleSplitDayOvertime = async (day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayRegs = registrations.filter(r => r.date === dateStr);
        if (dayRegs.length === 0) {
            alert('Geen registraties op deze dag om op te splitsen.');
            return;
        }
        if (dayRegs.some(r => isLockedStatus(r.status))) {
            alert('Deze dag is al ingediend of goedgekeurd.');
            return;
        }
        const ds = getScheduleForDay(day);
        const toDelete = [];
        const toAdd = [];

        dayRegs.forEach(reg => {
            if ((reg.type || '').toLowerCase() !== 'werk') return;
            const segments = splitSegments(reg, ds);
            if (segments.length > 1 || (segments.length === 1 && segments[0].type !== reg.type)) {
                toDelete.push(reg.id);
                segments.forEach(seg => {
                    // eslint-disable-next-line no-unused-vars
                    const { id, status, project_name, subject_name, username, user_id, ...rest } = seg;
                    toAdd.push(rest);
                });
            }
        });

        if (toDelete.length === 0) {
            alert('Alle werkuren vallen al binnen het rooster (of er zijn geen werkuren om te splitsen).');
            return;
        }
        for (const id of toDelete) await deleteRegistration(id);
        if (toAdd.length > 0) await addRegistrations(toAdd);
    };

    const handlePrev = () => setCurrentDate(isDay ? subDays(currentDate, 1) : subWeeks(currentDate, 1));
    const handleNext = () => setCurrentDate(isDay ? addDays(currentDate, 1) : addWeeks(currentDate, 1));
    const handleToday = () => setCurrentDate(new Date());

    const openDay = (day) => navigate('/dag', { state: { date: format(day, 'yyyy-MM-dd') } });

    const openNewDialog = (data) => {
        setFormData({ type: 'werk', description: '', entity_id: activeEntityId, ...projectDefaults(), ...data });
        setSelectedEntry(null);
        setIsDialogOpen(true);
    };

    const handleSlotClick = (day, time) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        if (isDateLocked(dateStr)) {
            alert('Deze periode is al ingediend of goedgekeurd.');
            return;
        }
        const end = toTime(Math.min(24 * 60 - 1, toMinutes(time) + step));
        openNewDialog({ date: dateStr, start: time, end });
    };

    const handleNewEntry = () => {
        const day = isDay ? currentDate : new Date();
        if (isDateLocked(format(day, 'yyyy-MM-dd'))) {
            alert('Deze periode is al ingediend of goedgekeurd. Kies een andere dag in de kalender.');
            return;
        }
        const ds = getScheduleForDay(day);
        openNewDialog({
            date: format(day, 'yyyy-MM-dd'),
            start: ds?.active ? formatTime(ds.start) : '08:00',
            end: ds?.active ? formatTime(ds.end) : '17:00',
        });
    };

    const handleEditEntry = (entry, e) => {
        e.stopPropagation();
        setSelectedEntry(entry);
        setFormData({
            date: entry.date,
            start: formatTime(entry.start),
            end: formatTime(entry.end),
            type: entry.type,
            description: entry.description || '',
            entity_id: entry.entity_id ?? activeEntityId,
            project_id: entry.project_id ?? null,
            subject_id: entry.subject_id ?? null,
        });
        setIsDialogOpen(true);
    };

    // Projecten/instellingen van de entiteit die in het formulier gekozen is
    const formEntity = entities.find(en => en.id === Number(formData.entity_id)) || null;
    const formSettings = formEntity?.settings;
    const formProjectMode = formSettings?.projectMode || 'off';
    const formProjects = formEntity?.projects || [];
    const formLocked = !!formSettings?.lockDefaultProject && !!formEntity?.defaultProjectId;
    const showProjectFields = formProjectMode !== 'off' && !isNonProjectType(formData.type);
    const formSubjects = formProjects.find(p => p.id === Number(formData.project_id))?.subjects || [];
    const entryReadOnly = !!selectedEntry && isLockedStatus(selectedEntry.status);

    const changeFormEntity = (id) => {
        const en = entities.find(x => x.id === Number(id));
        setFormData({
            ...formData,
            entity_id: Number(id),
            project_id: en?.settings?.projectMode !== 'off' ? (en?.defaultProjectId ?? null) : null,
            subject_id: en?.settings?.projectMode !== 'off' ? (en?.defaultSubjectId ?? null) : null,
        });
    };

    const saveEntry = async () => {
        const data = {
            ...formData,
            start: formatTime(formData.start),
            end: formatTime(formData.end),
            entity_id: formData.entity_id ? Number(formData.entity_id) : null,
            project_id: showProjectFields && formData.project_id ? Number(formData.project_id) : null,
            subject_id: showProjectFields && formData.subject_id ? Number(formData.subject_id) : null,
        };
        if (toMinutes(data.end) <= toMinutes(data.start)) {
            alert('Het tot-uur moet later zijn dan het van-uur.');
            return;
        }
        if (showProjectFields && formProjectMode === 'required' && !data.project_id) {
            alert('Kies een project voor deze registratie.');
            return;
        }

        const autoSplit = formSettings ? !!formSettings.autoSplitOvertime : autoSplitOvertime;
        let ok;
        if (!autoSplit || data.type.toLowerCase() !== 'werk') {
            ok = selectedEntry ? await updateRegistration(selectedEntry.id, data) : await addRegistration(data);
        } else {
            // Automatisch opsplitsen naar overuren
            const ds = getScheduleForDay(parseISO(data.date));
            const segments = splitSegments(data, ds);
            if (segments.length === 1) {
                ok = selectedEntry ? await updateRegistration(selectedEntry.id, segments[0]) : await addRegistration(segments[0]);
            } else {
                if (selectedEntry) await deleteRegistration(selectedEntry.id);
                ok = await addRegistrations(segments);
            }
        }
        if (ok) setIsDialogOpen(false);
    };

    const handleDelete = async () => {
        if (selectedEntry && await deleteRegistration(selectedEntry.id)) setIsDialogOpen(false);
    };

    // Positie (in slots) ten opzichte van het eerste zichtbare uur
    const getSlotOffset = (time) => (toMinutes(time) - startHour * 60) / step;

    const resolvedTypes = useMemo(() => {
        const base = formSettings?.customRegistrationTypes
            ? formSettings.customRegistrationTypes.split(',').map(t => t.trim()).filter(Boolean)
            : (customRegistrationTypes?.length ? customRegistrationTypes : ['Werk', 'Pauze', 'Ziekte', 'Verlof']);
        const split = formSettings ? formSettings.autoSplitOvertime || formSettings.allowManualSplitOvertime : (autoSplitOvertime || allowManualSplitOvertime);
        let list = base;
        if (split && !base.some(t => t.toLowerCase() === 'overuur')) list = [...base, 'Overuur'];
        // Het huidige type moet altijd selecteerbaar zijn (bv. 'werk' vs 'Werk')
        if (formData.type && !list.some(t => t.toLowerCase() === formData.type.toLowerCase())) {
            list = [...list, formData.type];
        }
        return list;
    }, [customRegistrationTypes, autoSplitOvertime, allowManualSplitOvertime, formSettings, formData.type]);

    const typeValue = resolvedTypes.find(t => t === formData.type)
        || resolvedTypes.find(t => t.toLowerCase() === (formData.type || '').toLowerCase())
        || formData.type;

    // Dagtotalen (voor de dagplanning)
    const dayTotals = useMemo(() => {
        if (!isDay) return null;
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const totals = {};
        registrations.filter(r => r.date === dateStr).forEach(r => {
            const key = (r.type || 'Onbekend').toLowerCase();
            totals[key] = (totals[key] || 0) + Math.max(0, toMinutes(r.end) - toMinutes(r.start));
        });
        return { totals, planned: plannedMinutes(getScheduleForDay(currentDate)) };
    }, [isDay, registrations, baseSchedule, currentDate.getTime(), rotation, rotationStartDate]);

    // Weektotaal (week/werkweek)
    const weekTotal = useMemo(() => {
        if (isDay) return null;
        let worked = 0;
        let planned = 0;
        visibleDays.forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            registrations.filter(r => r.date === dateStr && !isBreakType(r.type)).forEach(r => {
                worked += Math.max(0, toMinutes(r.end) - toMinutes(r.start));
            });
            planned += plannedMinutes(getScheduleForDay(day));
        });
        return { worked, planned };
    }, [isDay, mode, registrations, baseSchedule, currentDate.getTime(), rotation, rotationStartDate]);

    const dayRegsSorted = isDay
        ? registrations
            .filter(r => r.date === format(currentDate, 'yyyy-MM-dd'))
            .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
        : [];

    const timeOptionsStart = withValue(TIME_SLOTS, formData.start);
    const timeOptionsEnd = withValue(TIME_SLOTS, formData.end);

    const gridCols = isDay ? 'grid-cols-[56px_1fr]' : (isWorkweek ? 'grid-cols-[56px_repeat(5,minmax(0,1fr))]' : 'grid-cols-[56px_repeat(7,minmax(0,1fr))]');

    const entityName = (id) => (entities.length > 1 ? entities.find(e => e.id === id)?.name : null);
    const projectLabel = (reg) => [reg.project_name, reg.subject_name].filter(Boolean).join(' › ');

    // Indien-knop of status voor de periode van een dag
    const renderSubmitControl = (day, compact = false) => {
        if (approvalRequired === 'none' || !activeEntityId) return null;
        const p = periodFor(day);
        const sub = findSubmission(format(p.start, 'yyyy-MM-dd'));
        if (sub && sub.status !== 'rejected') {
            const Icon = sub.status === 'approved' ? CheckCircle2 : Lock;
            return (
                <span className={`inline-flex items-center gap-1 rounded border px-2 ${compact ? 'py-0.5 text-[10px]' : 'py-1 text-xs'} font-medium ${STATUS_STYLE[sub.status]}`}>
                    <Icon className="h-3 w-3" /> {STATUS_LABEL[sub.status]}
                    {sub.status === 'submitted' && !compact && (
                        <button type="button" onClick={() => handleWithdraw(sub)} className="ml-1 underline inline-flex items-center gap-0.5" title="Indiening intrekken">
                            <Undo2 className="h-3 w-3" /> intrekken
                        </button>
                    )}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1">
                {sub?.status === 'rejected' && !compact && (
                    <span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${STATUS_STYLE.rejected}`} title={sub.comment || ''}>
                        <XCircle className="h-3 w-3" /> Afgekeurd{sub.comment ? `: ${sub.comment}` : ''}
                    </span>
                )}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleSubmitPeriod(day); }}
                    className={compact ? 'h-6 px-1.5 text-[10px] w-full max-w-[90px]' : 'h-8 sm:h-9 text-emerald-700 border-emerald-200 dark:text-emerald-300 dark:border-emerald-800'}
                >
                    <Send className={compact ? 'h-2.5 w-2.5 mr-1' : 'h-4 w-4 mr-2'} />
                    {compact ? 'Indienen' : `${p.label.charAt(0).toUpperCase()}${p.label.slice(1)} indienen`}
                </Button>
            </span>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-lg shadow border dark:border-slate-800 overflow-hidden">

            {/* HEADER */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b dark:border-slate-800 gap-4">
                <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    <Button variant="outline" size="icon" onClick={handlePrev} className="h-8 w-8">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-lg sm:text-xl font-bold text-center capitalize">
                        {isDay
                            ? format(currentDate, 'EEEE d MMMM yyyy', { locale: nl })
                            : format(startDate, 'MMMM yyyy', { locale: nl })}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleNext} className="h-8 w-8">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center sm:justify-end">
                    <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                        W{weekNumber}
                        {rotation > 1 && <span className="text-slate-400 font-normal"> · roosterweek {cycleWeek}/{rotation}</span>}
                    </div>
                    {weekTotal && (
                        <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs sm:text-sm text-slate-600 dark:text-slate-300" title="Geregistreerd (zonder pauze) / gepland volgens rooster">
                            {formatDuration(weekTotal.worked)} <span className="text-slate-400">/ {formatDuration(weekTotal.planned)}</span>
                        </div>
                    )}
                    <Button variant="outline" size="sm" onClick={handleToday} className="h-8 sm:h-9">
                        <CalendarCheck className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Vandaag</span>
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleFill(visibleDays)} className="h-8 sm:h-9">
                        <Copy className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Rooster overnemen</span><span className="sm:hidden">Rooster</span>
                    </Button>
                    {isDay && allowManualSplitOvertime && (
                        <Button variant="outline" size="sm" onClick={() => handleSplitDayOvertime(currentDate)} className="h-8 sm:h-9 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                            <Split className="h-4 w-4 mr-2" /> Splits overuren
                        </Button>
                    )}
                    {(isDay || approvalRequired !== 'days') && renderSubmitControl(currentDate)}
                    <Button size="sm" onClick={handleNewEntry} className="h-8 sm:h-9">
                        <Plus className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Uren toevoegen</span><span className="sm:hidden">Toevoegen</span>
                    </Button>
                </div>
            </div>

            {/* DAGTOTALEN */}
            {isDay && dayTotals && (
                <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs">
                    {holidays.find(h => h.date === format(currentDate, 'yyyy-MM-dd')) && (
                        <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                            {holidays.find(h => h.date === format(currentDate, 'yyyy-MM-dd')).localName}
                        </span>
                    )}
                    <span className="text-slate-500">Gepland: <b className="text-slate-700 dark:text-slate-200">{formatDuration(Math.max(0, dayTotals.planned))}</b></span>
                    {Object.entries(dayTotals.totals).map(([type, mins]) => (
                        <span key={type} className={`px-2 py-1 rounded border capitalize ${getTypeStyle(type)}`}>
                            {type}: <b>{formatDuration(mins)}</b>
                        </span>
                    ))}
                    {Object.keys(dayTotals.totals).length === 0 && (
                        <span className="text-slate-400 italic">Nog geen registraties</span>
                    )}
                </div>
            )}

            {/* KALENDER */}
            <div className="flex-1 relative min-h-0">
                <div className="absolute inset-0 overflow-auto">
                    <div className={isDay ? '' : (isWorkweek ? 'min-w-[560px]' : 'min-w-[700px]')}>
                        {/* Dagkoppen (week en werkweek) */}
                        {!isDay && (
                            <div className={`grid ${gridCols} border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-20`}>
                                <div className="p-3 text-center text-xs font-medium text-slate-500 border-r dark:border-slate-800">
                                    Tijd
                                </div>
                                {visibleDays.map((day, i) => {
                                    const dateStr = format(day, 'yyyy-MM-dd');
                                    const holiday = holidays.find(h => h.date === dateStr);
                                    const isToday = isSameDay(day, new Date());

                                    return (
                                        <div key={i} className={`p-2 text-center border-r dark:border-slate-800 ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${holiday ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                                            <button type="button" onClick={() => openDay(day)} title="Open dagplanning" className="w-full hover:opacity-70">
                                                <div className="text-xs font-semibold capitalize flex flex-col items-center">
                                                    <span className="hidden sm:inline">{format(day, 'EEEE', { locale: nl })}</span>
                                                    <span className="sm:hidden">{format(day, 'EEE', { locale: nl })}</span>
                                                    {holiday && (
                                                        <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium truncate max-w-full" title={holiday.localName}>
                                                            {holiday.localName}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`text-xl mt-1 ${isToday ? 'text-blue-600 dark:text-blue-400 font-bold' : ''}`}>
                                                    {format(day, 'd')}
                                                </div>
                                            </button>
                                            <div className="flex flex-col items-center gap-1 mt-1">
                                                {allowManualSplitOvertime && !isDateLocked(dateStr) && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSplitDayOvertime(day);
                                                        }}
                                                        title="Uren van deze dag opsplitsen in overuren volgens rooster"
                                                        className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors w-full max-w-[90px]"
                                                    >
                                                        <Split className="h-2.5 w-2.5" />
                                                        <span className="truncate">Splits</span>
                                                    </button>
                                                )}
                                                {approvalRequired === 'days' && renderSubmitControl(day, true)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Raster */}
                        <div className={`grid ${gridCols} border-b dark:border-slate-800 pb-8`}>
                            {/* Uren */}
                            <div className="border-r dark:border-slate-800 bg-white dark:bg-slate-900">
                                {VISIBLE_SLOTS.map((time, i) => (
                                    <div key={i} className="border-b dark:border-slate-800 text-[10px] text-center text-slate-500 relative" style={{ height: `${slotHeight}px` }}>
                                        {time.endsWith('00') && <span className="absolute top-0 left-0 right-0 -mt-2 bg-white dark:bg-slate-900">{time}</span>}
                                    </div>
                                ))}
                            </div>

                            {/* Dagkolommen */}
                            {visibleDays.map((day, dIndex) => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const dayRegistrations = registrations.filter(r => r.date === dateStr);
                                const ds = getScheduleForDay(day);
                                const schedStart = ds && ds.active ? toMinutes(ds.start) : -1;
                                const schedEnd = ds && ds.active ? toMinutes(ds.end) : -1;
                                const locked = isDateLocked(dateStr);

                                return (
                                    <div key={dIndex} className={`relative border-r dark:border-slate-800 ${locked ? 'bg-slate-50 dark:bg-slate-900/60' : 'bg-white dark:bg-slate-900'}`}>
                                        {VISIBLE_SLOTS.map((time, i) => {
                                            const mins = toMinutes(time);
                                            const inSchedule = ds && ds.active && mins >= schedStart && mins < schedEnd;
                                            return (
                                                <div
                                                    key={i}
                                                    className={`border-b border-slate-100 dark:border-slate-800/50 transition-colors ${locked ? 'cursor-not-allowed' : 'hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer'} ${inSchedule ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}`}
                                                    style={{ height: `${slotHeight}px` }}
                                                    onClick={() => handleSlotClick(day, time)}
                                                />
                                            );
                                        })}

                                        {dayRegistrations.map((reg) => {
                                            const top = Math.max(0, getSlotOffset(reg.start));
                                            const bottom = Math.min(VISIBLE_SLOTS.length, getSlotOffset(reg.end));
                                            const height = (bottom - top) * slotHeight;
                                            if (height <= 0) return null;
                                            const regLocked = isLockedStatus(reg.status);
                                            const proj = projectLabel(reg);
                                            const ent = entityName(reg.entity_id);

                                            return (
                                                <div
                                                    key={reg.id}
                                                    className={`absolute ${isDay ? 'left-2 right-2 px-3' : 'left-1 right-1 p-1'} rounded border overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow ${getTypeStyle(reg.type)}`}
                                                    style={{ top: `${top * slotHeight}px`, height: `${height}px`, zIndex: 10 }}
                                                    onClick={(e) => handleEditEntry(reg, e)}
                                                    title={[reg.type, `${formatTime(reg.start)}-${formatTime(reg.end)}`, proj, ent, reg.description].filter(Boolean).join(' · ')}
                                                >
                                                    {isDay ? (
                                                        <div className="flex items-baseline gap-3 py-1 text-sm">
                                                            <span className="font-bold capitalize inline-flex items-center gap-1">{regLocked && <Lock className="h-3 w-3" />}{reg.type}</span>
                                                            <span className="opacity-80">{formatTime(reg.start)} - {formatTime(reg.end)}</span>
                                                            <span className="opacity-60 text-xs">({formatDuration(toMinutes(reg.end) - toMinutes(reg.start))})</span>
                                                            {proj && <span className="truncate text-xs font-medium">{proj}</span>}
                                                            {ent && <span className="truncate text-xs opacity-70">{ent}</span>}
                                                            {reg.description && <span className="truncate text-xs">{reg.description}</span>}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="text-xs font-bold capitalize inline-flex items-center gap-1">{regLocked && <Lock className="h-2.5 w-2.5" />}{reg.type}</div>
                                                            <div className="text-[10px] opacity-80">{formatTime(reg.start)} - {formatTime(reg.end)}</div>
                                                            {proj && <div className="text-[10px] truncate font-medium">{proj}</div>}
                                                            {reg.description && (
                                                                <div className="text-[10px] truncate mt-0.5">{reg.description}</div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Lijst onder de dagplanning */}
                        {isDay && dayRegsSorted.length > 0 && (
                            <div className="p-4 space-y-2">
                                <div className="text-xs font-semibold uppercase text-slate-500">Registraties</div>
                                {dayRegsSorted.map(reg => (
                                    <button
                                        key={reg.id}
                                        type="button"
                                        onClick={(e) => handleEditEntry(reg, e)}
                                        className={`w-full flex items-center justify-between gap-3 rounded border px-3 py-2 text-left text-sm ${getTypeStyle(reg.type)}`}
                                    >
                                        <span className="font-semibold capitalize inline-flex items-center gap-1">{isLockedStatus(reg.status) && <Lock className="h-3 w-3" />}{reg.type}</span>
                                        <span className="flex-1 truncate text-xs opacity-80">
                                            {[projectLabel(reg), entityName(reg.entity_id), reg.description].filter(Boolean).join(' · ')}
                                        </span>
                                        <span className="tabular-nums">{formatTime(reg.start)} - {formatTime(reg.end)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{entryReadOnly ? 'Registratie (vergrendeld)' : selectedEntry ? 'Registratie aanpassen' : 'Nieuwe registratie'}</DialogTitle>
                    </DialogHeader>
                    {entryReadOnly && (
                        <div className={`rounded border px-3 py-2 text-sm flex items-center gap-2 ${STATUS_STYLE[selectedEntry.status]}`}>
                            <Lock className="h-4 w-4" />
                            {selectedEntry.status === 'approved' ? 'Goedgekeurd: deze registratie kan niet meer gewijzigd worden.' : 'Ingediend: trek de indiening in om deze registratie te wijzigen.'}
                        </div>
                    )}
                    <fieldset disabled={entryReadOnly} className="grid gap-4 py-4 disabled:opacity-80">
                        {entities.length > 1 && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="entity" className="text-right">Entiteit</Label>
                                <select id="entity" className={`${NATIVE_SELECT} col-span-3`} value={formData.entity_id ?? ''} onChange={e => changeFormEntity(e.target.value)}>
                                    {entities.map(en => <option key={en.id} value={en.id}>{en.companyName ? `${en.companyName} - ` : ''}{en.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="date" className="text-right">Datum</Label>
                            <Input type="date" id="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="start" className="text-right">Van</Label>
                            <Input
                                type="time"
                                id="start-mobile"
                                value={formatTime(formData.start)}
                                step={step * 60}
                                onChange={e => setFormData({ ...formData, start: e.target.value })}
                                className="col-span-3 md:hidden block"
                            />
                            <div className="col-span-3 hidden md:block">
                                <Select value={formatTime(formData.start)} onValueChange={v => setFormData({ ...formData, start: v })} disabled={entryReadOnly}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {timeOptionsStart.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="end" className="text-right">Tot</Label>
                            <Input
                                type="time"
                                id="end-mobile"
                                value={formatTime(formData.end)}
                                step={step * 60}
                                onChange={e => setFormData({ ...formData, end: e.target.value })}
                                className="col-span-3 md:hidden block"
                            />
                            <div className="col-span-3 hidden md:block">
                                <Select value={formatTime(formData.end)} onValueChange={v => setFormData({ ...formData, end: v })} disabled={entryReadOnly}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {timeOptionsEnd.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right font-bold">Type</Label>
                            <Select value={typeValue} onValueChange={v => setFormData({ ...formData, type: v })} disabled={entryReadOnly}>
                                <SelectTrigger className="col-span-3 h-14 text-lg font-semibold bg-slate-50 dark:bg-slate-800"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {resolvedTypes.map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {showProjectFields && (
                            <>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="project" className="text-right">
                                        Project{formProjectMode === 'required' && <span className="text-red-500"> *</span>}
                                    </Label>
                                    <select
                                        id="project"
                                        className={`${NATIVE_SELECT} col-span-3`}
                                        value={formData.project_id ?? ''}
                                        disabled={formLocked}
                                        onChange={e => setFormData({ ...formData, project_id: e.target.value ? Number(e.target.value) : null, subject_id: null })}
                                    >
                                        <option value="">{formProjectMode === 'required' ? '— Kies een project —' : '(geen project)'}</option>
                                        {formProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        {formData.project_id && !formProjects.some(p => p.id === Number(formData.project_id)) && (
                                            <option value={formData.project_id}>{selectedEntry?.project_name || `Project ${formData.project_id}`} (inactief)</option>
                                        )}
                                    </select>
                                </div>
                                {(formSubjects.length > 0 || formData.subject_id) && (
                                    <div className="grid grid-cols-4 items-center gap-4">
                                        <Label htmlFor="subject" className="text-right">Subject</Label>
                                        <select
                                            id="subject"
                                            className={`${NATIVE_SELECT} col-span-3`}
                                            value={formData.subject_id ?? ''}
                                            disabled={formLocked}
                                            onChange={e => setFormData({ ...formData, subject_id: e.target.value ? Number(e.target.value) : null })}
                                        >
                                            <option value="">(geen subject)</option>
                                            {formSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            {formData.subject_id && !formSubjects.some(s => s.id === Number(formData.subject_id)) && (
                                                <option value={formData.subject_id}>{selectedEntry?.subject_name || `Subject ${formData.subject_id}`} (inactief)</option>
                                            )}
                                        </select>
                                    </div>
                                )}
                                {formLocked && (
                                    <p className="text-xs text-muted-foreground -mt-2 col-span-4 text-right">Je vaste project is ingesteld door je admin.</p>
                                )}
                            </>
                        )}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="desc" className="text-right">Omschrijving</Label>
                            <Input id="desc" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="(optioneel)" className="col-span-3" />
                        </div>
                    </fieldset>
                    <DialogFooter className="flex justify-between w-full">
                        {selectedEntry && !entryReadOnly ? (
                            <Button type="button" variant="destructive" onClick={handleDelete}>Verwijderen</Button>
                        ) : <div></div>}
                        {entryReadOnly
                            ? <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Sluiten</Button>
                            : <Button type="button" onClick={saveEntry}>Opslaan</Button>}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
