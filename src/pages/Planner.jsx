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
import { ChevronLeft, ChevronRight, Plus, Copy, Split, CalendarCheck } from 'lucide-react';
import { Button } from '../components/ui/button';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

import { generateTimeOptions } from './Settings';
import { formatTime, toMinutes, toTime, withValue } from '../lib/time';

const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 18;

const formatDuration = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}u${String(m).padStart(2, '0')}`;
};

export default function Planner({ mode = 'week' }) {
    const isDay = mode === 'day';
    const location = useLocation();
    const navigate = useNavigate();

    const [currentDate, setCurrentDate] = useState(() => {
        const fromState = location.state?.date;
        return fromState ? parseISO(fromState) : new Date();
    });
    const { registrations, baseSchedule, holidays, addRegistration, addRegistrations, updateRegistration, deleteRegistration, timeStep, customRegistrationTypes, autoSplitOvertime, allowManualSplitOvertime } = useStore();
    const [autoFilledWeeks, setAutoFilledWeeks] = useState(new Set());

    const step = timeStep || 30;
    const TIME_SLOTS = useMemo(() => generateTimeOptions(step), [step]);
    const pixelsPerMinute = 1.6; // 48px for 30mins
    const slotHeight = step * pixelsPerMinute;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        start: '08:00',
        end: '17:00',
        type: 'werk',
        description: ''
    });

    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    const weekNumber = getISOWeek(startDate);
    const isWeek2 = weekNumber % 2 !== 0;

    const daysThisWeek = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
    }, [startDate.getTime()]);

    const visibleDays = isDay ? [currentDate] : daysThisWeek;

    // Rooster van een specifieke dag (houdt rekening met week 1 / week 2)
    const getScheduleForDay = (day) => {
        const dayIdx = (day.getDay() + 6) % 7; // 0 = maandag
        const week2 = getISOWeek(day) % 2 !== 0;
        return baseSchedule[week2 ? dayIdx + 7 : dayIdx];
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
    }, [registrations, baseSchedule, isDay, currentDate.getTime()]);

    const VISIBLE_SLOTS = useMemo(
        () => TIME_SLOTS.filter(t => {
            const h = parseInt(t.split(':')[0], 10);
            return h >= startHour && h < endHour;
        }),
        [TIME_SLOTS, startHour, endHour]
    );

    // Automatisch rooster invullen als een week nog volledig leeg is
    useEffect(() => {
        const weekKey = format(startDate, 'yyyy-ww');
        if (autoFilledWeeks.has(weekKey)) return;

        const hasAnyRegThisWeek = registrations.some(r => {
            const rDate = parseISO(r.date);
            return rDate >= startDate && rDate < addDays(startDate, 7);
        });

        if (!hasAnyRegThisWeek && baseSchedule.length > 0) {
            handleFill(daysThisWeek, true);
            setAutoFilledWeeks(prev => new Set(prev).add(weekKey));
        }
    }, [startDate.getTime(), registrations, baseSchedule]);

    const handleFill = (days, silent = false) => {
        const newRegs = [];
        days.forEach((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const hasReg = registrations.some(r => r.date === dateStr);
            if (hasReg) return;
            const ds = getScheduleForDay(day);
            if (!ds || !ds.active) return;
            if (ds.hasBreak && ds.breakStart && ds.breakEnd) {
                newRegs.push({ date: dateStr, start: formatTime(ds.start), end: formatTime(ds.breakStart), type: 'werk', description: 'Voor de middag' });
                newRegs.push({ date: dateStr, start: formatTime(ds.breakStart), end: formatTime(ds.breakEnd), type: 'pauze', description: 'Pauze' });
                newRegs.push({ date: dateStr, start: formatTime(ds.breakEnd), end: formatTime(ds.end), type: 'werk', description: 'Na de middag' });
            } else {
                newRegs.push({ date: dateStr, start: formatTime(ds.start), end: formatTime(ds.end), type: 'werk', description: 'Basisrooster' });
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

    const handleSplitDayOvertime = (day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayRegs = registrations.filter(r => r.date === dateStr);
        if (dayRegs.length === 0) {
            alert('Geen registraties op deze dag om op te splitsen.');
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
                    const { id, ...rest } = seg;
                    toAdd.push(rest);
                });
            }
        });

        if (toDelete.length === 0) {
            alert('Alle werkuren vallen al binnen het rooster (of er zijn geen werkuren om te splitsen).');
            return;
        }
        toDelete.forEach(id => deleteRegistration(id));
        if (toAdd.length > 0) addRegistrations(toAdd);
    };

    const handlePrev = () => setCurrentDate(isDay ? subDays(currentDate, 1) : subWeeks(currentDate, 1));
    const handleNext = () => setCurrentDate(isDay ? addDays(currentDate, 1) : addWeeks(currentDate, 1));
    const handleToday = () => setCurrentDate(new Date());

    const openDay = (day) => navigate('/dag', { state: { date: format(day, 'yyyy-MM-dd') } });

    const handleSlotClick = (day, time) => {
        const end = toTime(Math.min(24 * 60 - 1, toMinutes(time) + step));
        setFormData({ date: format(day, 'yyyy-MM-dd'), start: time, end, type: 'werk', description: '' });
        setSelectedEntry(null);
        setIsDialogOpen(true);
    };

    const handleNewEntry = () => {
        const ds = getScheduleForDay(currentDate);
        setFormData({
            date: format(isDay ? currentDate : new Date(), 'yyyy-MM-dd'),
            start: ds?.active ? formatTime(ds.start) : '08:00',
            end: ds?.active ? formatTime(ds.end) : '17:00',
            type: 'werk',
            description: ''
        });
        setSelectedEntry(null);
        setIsDialogOpen(true);
    };

    const handleEditEntry = (entry, e) => {
        e.stopPropagation();
        setSelectedEntry(entry);
        setFormData({
            date: entry.date,
            start: formatTime(entry.start),
            end: formatTime(entry.end),
            type: entry.type,
            description: entry.description || ''
        });
        setIsDialogOpen(true);
    };

    const saveEntry = () => {
        const data = { ...formData, start: formatTime(formData.start), end: formatTime(formData.end) };
        if (toMinutes(data.end) <= toMinutes(data.start)) {
            alert('Het tot-uur moet later zijn dan het van-uur.');
            return;
        }

        if (!autoSplitOvertime || data.type.toLowerCase() !== 'werk') {
            if (selectedEntry) updateRegistration(selectedEntry.id, data);
            else addRegistration(data);
            setIsDialogOpen(false);
            return;
        }

        // Automatisch opsplitsen naar overuren
        const ds = getScheduleForDay(parseISO(data.date));
        const segments = splitSegments(data, ds);

        if (segments.length === 1) {
            if (selectedEntry) updateRegistration(selectedEntry.id, segments[0]);
            else addRegistration(segments[0]);
        } else {
            if (selectedEntry) deleteRegistration(selectedEntry.id);
            addRegistrations(segments);
        }
        setIsDialogOpen(false);
    };

    const handleDelete = () => {
        if (selectedEntry) {
            deleteRegistration(selectedEntry.id);
            setIsDialogOpen(false);
        }
    };

    // Positie (in slots) ten opzichte van het eerste zichtbare uur
    const getSlotOffset = (time) => (toMinutes(time) - startHour * 60) / step;

    const getTypeStyle = (type) => {
        const t = (type || '').toLowerCase();
        switch (t) {
            case 'werk': return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700';
            case 'ziekte': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-200 dark:border-red-700';
            case 'verlof': return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700';
            case 'pauze': return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-200 dark:border-orange-700';
            case 'overuur': return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700';
            default: return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700/50 dark:text-gray-200 dark:border-gray-600';
        }
    };

    const resolvedTypes = useMemo(() => {
        const base = customRegistrationTypes?.length ? customRegistrationTypes : ['Werk', 'Pauze', 'Ziekte', 'Verlof'];
        let list = base;
        if (autoSplitOvertime && !base.some(t => t.toLowerCase() === 'overuur')) list = [...base, 'Overuur'];
        // Zorg dat het huidige type altijd selecteerbaar is (bv. 'werk' vs 'Werk')
        if (formData.type && !list.includes(formData.type)) {
            const match = list.find(t => t.toLowerCase() === formData.type.toLowerCase());
            if (!match) list = [...list, formData.type];
        }
        return list;
    }, [customRegistrationTypes, autoSplitOvertime, formData.type]);

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
        const ds = getScheduleForDay(currentDate);
        let planned = 0;
        if (ds && ds.active) {
            planned = toMinutes(ds.end) - toMinutes(ds.start);
            if (ds.hasBreak && ds.breakStart && ds.breakEnd) planned -= toMinutes(ds.breakEnd) - toMinutes(ds.breakStart);
        }
        return { totals, planned };
    }, [isDay, registrations, baseSchedule, currentDate.getTime()]);

    const dayRegsSorted = isDay
        ? registrations
            .filter(r => r.date === format(currentDate, 'yyyy-MM-dd'))
            .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
        : [];

    const timeOptionsStart = withValue(TIME_SLOTS, formData.start);
    const timeOptionsEnd = withValue(TIME_SLOTS, formData.end);

    const gridCols = isDay ? 'grid-cols-[56px_1fr]' : 'grid-cols-8';

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
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto justify-center sm:justify-end">
                    <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                        W{weekNumber} <span className="hidden sm:inline text-slate-400 font-normal">({isWeek2 ? 'Week 2' : 'Week 1'})</span>
                    </div>
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

            {/* CALENDAR BODY */}
            <div className="flex-1 relative min-h-0">
                <div className="absolute inset-0 overflow-auto">
                    <div className={isDay ? '' : 'min-w-[700px]'}>
                        {/* Day Headers (alleen weekweergave) */}
                        {!isDay && (
                            <div className={`grid ${gridCols} border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-20`}>
                                <div className="p-3 text-center text-xs font-medium text-slate-500 border-r dark:border-slate-800">
                                    Tijd
                                </div>
                                {daysThisWeek.map((day, i) => {
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
                                            {allowManualSplitOvertime && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSplitDayOvertime(day);
                                                    }}
                                                    title="Uren van deze dag opsplitsen in overuren volgens rooster"
                                                    className="mt-1 inline-flex items-center justify-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors w-full max-w-[90px]"
                                                >
                                                    <Split className="h-2.5 w-2.5" />
                                                    <span className="truncate">Splits</span>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Scrolling Grid */}
                        <div className={`grid ${gridCols} border-b dark:border-slate-800 pb-8`}>
                            {/* Time Labels */}
                            <div className="border-r dark:border-slate-800 bg-white dark:bg-slate-900">
                                {VISIBLE_SLOTS.map((time, i) => (
                                    <div key={i} className="border-b dark:border-slate-800 text-[10px] text-center text-slate-500 relative" style={{ height: `${slotHeight}px` }}>
                                        {time.endsWith('00') && <span className="absolute top-0 left-0 right-0 -mt-2 bg-white dark:bg-slate-900">{time}</span>}
                                    </div>
                                ))}
                            </div>

                            {/* Day Columns */}
                            {visibleDays.map((day, dIndex) => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const dayRegistrations = registrations.filter(r => r.date === dateStr);
                                const ds = getScheduleForDay(day);
                                const schedStart = ds && ds.active ? toMinutes(ds.start) : -1;
                                const schedEnd = ds && ds.active ? toMinutes(ds.end) : -1;

                                return (
                                    <div key={dIndex} className="relative border-r dark:border-slate-800 bg-white dark:bg-slate-900">
                                        {VISIBLE_SLOTS.map((time, i) => {
                                            const mins = toMinutes(time);
                                            const inSchedule = ds && ds.active && mins >= schedStart && mins < schedEnd;
                                            return (
                                                <div
                                                    key={i}
                                                    className={`border-b border-slate-100 dark:border-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors ${inSchedule ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}`}
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

                                            return (
                                                <div
                                                    key={reg.id}
                                                    className={`absolute ${isDay ? 'left-2 right-2 px-3' : 'left-1 right-1 p-1'} rounded border overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow ${getTypeStyle(reg.type)}`}
                                                    style={{ top: `${top * slotHeight}px`, height: `${height}px`, zIndex: 10 }}
                                                    onClick={(e) => handleEditEntry(reg, e)}
                                                >
                                                    {isDay ? (
                                                        <div className="flex items-baseline gap-3 py-1 text-sm">
                                                            <span className="font-bold capitalize">{reg.type}</span>
                                                            <span className="opacity-80">{formatTime(reg.start)} - {formatTime(reg.end)}</span>
                                                            <span className="opacity-60 text-xs">({formatDuration(toMinutes(reg.end) - toMinutes(reg.start))})</span>
                                                            {reg.description && <span className="truncate text-xs">{reg.description}</span>}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="text-xs font-bold capitalize">{reg.type}</div>
                                                            <div className="text-[10px] opacity-80">{formatTime(reg.start)} - {formatTime(reg.end)}</div>
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

                        {/* Lijstweergave onder de dagplanning */}
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
                                        <span className="font-semibold capitalize">{reg.type}</span>
                                        <span className="flex-1 truncate text-xs opacity-80">{reg.description}</span>
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
                        <DialogTitle>{selectedEntry ? 'Registratie aanpassen' : 'Nieuwe registratie'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
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
                                <Select value={formatTime(formData.start)} onValueChange={v => setFormData({ ...formData, start: v })}>
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
                                <Select value={formatTime(formData.end)} onValueChange={v => setFormData({ ...formData, end: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {timeOptionsEnd.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right font-bold">Type</Label>
                            <Select value={typeValue} onValueChange={v => setFormData({ ...formData, type: v })}>
                                <SelectTrigger className="col-span-3 h-14 text-lg font-semibold bg-slate-50 dark:bg-slate-800"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {resolvedTypes.map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="desc" className="text-right">Omschrijving</Label>
                            <Input id="desc" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="(optioneel)" className="col-span-3" />
                        </div>
                    </div>
                    <DialogFooter className="flex justify-between w-full">
                        {selectedEntry ? (
                            <Button type="button" variant="destructive" onClick={handleDelete}>Verwijderen</Button>
                        ) : <div></div>}
                        <Button type="button" onClick={saveEntry}>Opslaan</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
