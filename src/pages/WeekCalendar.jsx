import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
    startOfWeek,
    addDays,
    format,
    subWeeks,
    addWeeks,
    getISOWeek,
    isSameDay,
    parseISO,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Copy } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2).toString().padStart(2, '0');
    const min = (i % 2 === 0) ? '00' : '30';
    return `${hour}:${min}`;
});

export default function WeekCalendar() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const { registrations, baseSchedule, holidays, addRegistration, addRegistrations, updateRegistration, deleteRegistration } = useStore();
    const [autoFilledWeeks, setAutoFilledWeeks] = useState(new Set());

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
    }, [startDate]);

    // Automatic Fill Logic
    useEffect(() => {
        const weekKey = format(startDate, 'yyyy-ww');
        if (autoFilledWeeks.has(weekKey)) return;

        const hasAnyRegThisWeek = registrations.some(r => {
            const rDate = parseISO(r.date);
            return rDate >= startDate && rDate < addDays(startDate, 7);
        });

        if (!hasAnyRegThisWeek && baseSchedule.length > 0) {
            handleFillWeek();
            setAutoFilledWeeks(prev => new Set(prev).add(weekKey));
        }
    }, [startDate, registrations, baseSchedule]);

    const handleFillWeek = () => {
        const newRegs = [];
        daysThisWeek.forEach((day, dIndex) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const hasReg = registrations.some(r => r.date === dateStr);
            if (!hasReg) {
                const baseScheduleIndex = isWeek2 ? dIndex + 7 : dIndex;
                const ds = baseSchedule[baseScheduleIndex];
                if (ds && ds.active) {
                    if (ds.hasBreak && ds.breakStart && ds.breakEnd) {
                        // Work before break
                        newRegs.push({
                            date: dateStr,
                            start: ds.start,
                            end: ds.breakStart,
                            type: 'werk',
                            description: 'Voor de middag'
                        });
                        // Break
                        newRegs.push({
                            date: dateStr,
                            start: ds.breakStart,
                            end: ds.breakEnd,
                            type: 'pauze',
                            description: 'Pauze'
                        });
                        // Work after break
                        newRegs.push({
                            date: dateStr,
                            start: ds.breakEnd,
                            end: ds.end,
                            type: 'werk',
                            description: 'Na de middag'
                        });
                    } else {
                        // Single block
                        newRegs.push({
                            date: dateStr,
                            start: ds.start,
                            end: ds.end,
                            type: 'werk',
                            description: 'Basisrooster'
                        });
                    }
                }
            }
        });

        if (newRegs.length > 0) {
            addRegistrations(newRegs);
        } else {
            alert('Er zijn al uren ingevuld of er zijn geen actieve dagen in het basisrooster voor deze week.');
        }
    };

    const handlePrevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
    const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));

    const handleSlotClick = (day, time) => {
        setFormData({
            date: format(day, 'yyyy-MM-dd'),
            start: time,
            end: time, // Default 30 min duration can be improved
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
            start: entry.start,
            end: entry.end,
            type: entry.type,
            description: entry.description || ''
        });
        setIsDialogOpen(true);
    };

    const saveEntry = () => {
        if (selectedEntry) {
            updateRegistration(selectedEntry.id, formData);
        } else {
            addRegistration(formData);
        }
        setIsDialogOpen(false);
    };

    const handleDelete = () => {
        if (selectedEntry) {
            deleteRegistration(selectedEntry.id);
            setIsDialogOpen(false);
        }
    };

    // Helper to place items correctly. Very basic fixed heights.
    // We'll use absolute positioning in each column
    const getSlotPosition = (time) => {
        const [h, m] = time.split(':').map(Number);
        return (h * 60 + m) / 30; // index out of 48 slots
    };

    const getTypeStyle = (type) => {
        switch (type) {
            case 'werk': return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700';
            case 'ziekte': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-200 dark:border-red-700';
            case 'verlof': return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700';
            case 'pauze': return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-200 dark:border-orange-700';
            default: return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-lg shadow border dark:border-slate-800 overflow-hidden">

            {/* HEADER */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b dark:border-slate-800 gap-4">
                <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    <Button variant="outline" size="icon" onClick={handlePrevWeek} className="h-8 w-8">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-lg sm:text-xl font-bold text-center">
                        {format(startDate, 'MMMM yyyy', { locale: nl })}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleNextWeek} className="h-8 w-8">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto justify-center sm:justify-end">
                    <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                        W{weekNumber} <span className="hidden sm:inline text-slate-400 font-normal">({isWeek2 ? 'Week 2' : 'Week 1'})</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handleFillWeek} className="h-8 sm:h-9">
                        <Copy className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Rooster overnemen</span><span className="sm:hidden">Rooster</span>
                    </Button>
                    <Button size="sm" onClick={() => {
                        setSelectedEntry(null);
                        setIsDialogOpen(true);
                    }} className="h-8 sm:h-9">
                        <Plus className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">Uren toevoegen</span><span className="sm:hidden">Toevoegen</span>
                    </Button>
                </div>
            </div>

            {/* CALENDAR BODY */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1" dir="ltr">
                    {/* Unified Width Container */}
                    <div className="min-w-[700px]">
                        {/* Day Headers */}
                        <div className="grid grid-cols-8 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-20">
                            <div className="p-3 text-center text-xs font-medium text-slate-500 border-r dark:border-slate-800">
                                Tijd
                            </div>
                            {daysThisWeek.map((day, i) => {
                                const dateStr = format(day, 'yyyy-MM-dd');
                                const holiday = holidays.find(h => h.date === dateStr);
                                const isToday = isSameDay(day, new Date());

                                return (
                                    <div key={i} className={`p-2 text-center border-r dark:border-slate-800 ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${holiday ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
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
                                    </div>
                                );
                            })}
                        </div>

                        {/* Scrolling Grid */}
                        <div className="grid grid-cols-8 border-b dark:border-slate-800 pb-8">
                            {/* Time Labels */}
                            <div className="border-r dark:border-slate-800 bg-white dark:bg-slate-900">
                                {TIME_SLOTS.filter(t => parseInt(t.split(':')[0]) >= 6 && parseInt(t.split(':')[0]) <= 17).map((time, i) => (
                                    <div key={i} className="h-12 border-b dark:border-slate-800 text-[10px] text-center p-1 text-slate-500">
                                        {time.endsWith('00') ? time : ''}
                                    </div>
                                ))}
                            </div>

                        {/* Day Columns */}
                        {daysThisWeek.map((day, dIndex) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const dayRegistrations = registrations.filter(r => r.date === dateStr);

                            // Base schedule overlay
                            const baseScheduleIndex = isWeek2 ? dIndex + 7 : dIndex;
                            const ds = baseSchedule[baseScheduleIndex];
                            const scheduleStartIdx = ds.active ? getSlotPosition(ds.start) : -1;
                            const scheduleEndIdx = ds.active ? getSlotPosition(ds.end) : -1;

                            return (
                                <div key={dIndex} className="relative border-r dark:border-slate-800 bg-white dark:bg-slate-900">

                                    {/* The grid lines & clickable slots */}
                                    {TIME_SLOTS.filter(t => parseInt(t.split(':')[0]) >= 6 && parseInt(t.split(':')[0]) <= 17).map((time, i) => {
                                        const origIndex = TIME_SLOTS.indexOf(time);
                                        return (
                                            <div
                                                key={i}
                                                className={`h-12 border-b border-slate-100 dark:border-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors ${ds.active && origIndex >= scheduleStartIdx && origIndex < scheduleEndIdx
                                                    ? 'bg-slate-50/50 dark:bg-slate-800/30'
                                                    : ''
                                                    }`}
                                                onClick={() => handleSlotClick(day, time)}
                                            >
                                            </div>
                                        )
                                    })}

                                    {/* Registered items */}
                                    {dayRegistrations.map((reg) => {
                                        const startHour = parseInt(reg.start.split(':')[0]);
                                        // Only render if it falls within visible bounds (or partially)
                                        if (startHour > 17 || parseInt(reg.end.split(':')[0]) < 6) return null;

                                        // Adjust start relative to 06:00
                                        const startIdx = Math.max(0, getSlotPosition(reg.start) - 12); // -12 because 6 hours * 2 slots
                                        const absoluteEndIdx = getSlotPosition(reg.end);
                                        const endIdx = Math.min(24, absoluteEndIdx - 12); // Max 24 slots (12 hours * 2) after 06:00

                                        const height = (endIdx - startIdx) * 48; // 48px per slot (h-12)

                                        return (
                                            <div
                                                key={reg.id}
                                                className={`absolute left-1 right-1 rounded border overflow-hidden p-1 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${getTypeStyle(reg.type)}`}
                                                style={{
                                                    top: `${startIdx * 48}px`,
                                                    height: `${height}px`,
                                                    zIndex: 10
                                                }}
                                                onClick={(e) => handleEditEntry(reg, e)}
                                            >
                                                <div className="text-xs font-bold capitalize">{reg.type}</div>
                                                <div className="text-[10px] opacity-80">{reg.start} - {reg.end}</div>
                                                {reg.description && (
                                                    <div className="text-[10px] truncate mt-0.5">{reg.description}</div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                        </div>
                    </div>
                </ScrollArea>
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
                            <Label className="text-right">Van</Label>
                            <Select value={formData.start} onValueChange={v => setFormData({ ...formData, start: v })}>
                                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Tot</Label>
                            <Select value={formData.end} onValueChange={v => setFormData({ ...formData, end: v })}>
                                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Type</Label>
                            <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v })}>
                                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="werk">Werk</SelectItem>
                                    <SelectItem value="pauze">Pauze</SelectItem>
                                    <SelectItem value="ziekte">Ziekte</SelectItem>
                                    <SelectItem value="verlof">Verlof</SelectItem>
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
