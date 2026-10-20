import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, format, isSameMonth, isToday, addMonths, subMonths, getISOWeek,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarCheck, Lock, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toMinutes } from '../lib/time';
import { getScheduleForDate, plannedMinutes, isBreakType, isAbsenceType, isOvertimeType } from '../lib/schedule';
import { formatDuration, getTypeStyle } from '../lib/ui';

const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

const signed = (mins) => `${mins > 0 ? '+' : mins < 0 ? '-' : ''}${formatDuration(Math.abs(mins))}`;

export default function MonthCalendar() {
    const navigate = useNavigate();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const { registrations, baseSchedule, holidays, scheduleRotationWeeks, rotationStartDate } = useStore();

    const days = useMemo(() => {
        const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
        return eachDayOfInterval({ start, end });
    }, [currentMonth]);

    const regsByDate = useMemo(() => {
        const map = {};
        registrations.forEach(r => { (map[r.date] = map[r.date] || []).push(r); });
        return map;
    }, [registrations]);

    const getDayStats = (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayRegs = regsByDate[dateStr] || [];
        const expected = plannedMinutes(getScheduleForDate(date, baseSchedule, scheduleRotationWeeks, rotationStartDate));

        const byType = {};
        let worked = 0;
        let absence = 0;
        let overtime = 0;
        dayRegs.forEach(reg => {
            const mins = Math.max(0, toMinutes(reg.end) - toMinutes(reg.start));
            const key = (reg.type || 'Onbekend').toLowerCase();
            byType[key] = (byType[key] || 0) + mins;
            if (isBreakType(reg.type)) return;
            if (isAbsenceType(reg.type)) absence += mins;
            else if (isOvertimeType(reg.type)) overtime += mins;
            else worked += mins;
        });

        const total = worked + absence + overtime;
        const statuses = new Set(dayRegs.map(r => r.status));
        return {
            expected,
            byType,
            worked,
            absence,
            overtime,
            total,
            diff: total - expected,
            holiday: holidays.find(h => h.date === dateStr),
            approved: dayRegs.length > 0 && [...statuses].every(s => s === 'approved'),
            submitted: statuses.has('submitted'),
        };
    };

    const monthTotals = useMemo(() => {
        return days.filter(d => isSameMonth(d, currentMonth)).reduce((acc, day) => {
            const s = getDayStats(day);
            acc.expected += s.expected;
            acc.worked += s.worked;
            acc.absence += s.absence;
            acc.overtime += s.overtime;
            acc.diff += s.diff;
            return acc;
        }, { expected: 0, worked: 0, absence: 0, overtime: 0, diff: 0 });
    }, [days, regsByDate, baseSchedule, currentMonth, holidays, scheduleRotationWeeks, rotationStartDate]);

    const openDay = (day) => navigate('/dag', { state: { date: format(day, 'yyyy-MM-dd') } });

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-lg shadow border dark:border-slate-800 overflow-hidden">

            {/* HEADER */}
            <div className="flex flex-col lg:flex-row items-center justify-between p-4 border-b dark:border-slate-800 gap-4">
                <div className="flex items-center gap-2 sm:gap-4">
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="h-8 w-8">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-xl font-bold w-44 text-center capitalize">
                        {format(currentMonth, 'MMMM yyyy', { locale: nl })}
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="h-8 w-8">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())} className="h-8">
                        <CalendarCheck className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Deze maand</span>
                    </Button>
                </div>

                <div className="flex flex-wrap justify-center gap-2 text-xs">
                    {[
                        ['Gepland', formatDuration(monthTotals.expected), ''],
                        ['Gewerkt', formatDuration(monthTotals.worked), ''],
                        ['Overuren', formatDuration(monthTotals.overtime), 'text-purple-600 dark:text-purple-300'],
                        ['Afwezig', formatDuration(monthTotals.absence), ''],
                        ['Saldo', signed(monthTotals.diff), monthTotals.diff >= 0 ? 'text-green-600' : 'text-red-600'],
                    ].map(([label, value, cls]) => (
                        <div key={label} className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border dark:border-slate-700 min-w-[76px]">
                            <span className="text-slate-500 block">{label}</span>
                            <span className={`font-bold text-sm tabular-nums ${cls}`}>{value}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* KALENDER */}
            <div className="flex-1 relative min-h-0">
                <div className="absolute inset-0 overflow-auto">
                    <div className="min-w-[640px]">
                        <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                            <div className="p-2 text-center text-[10px] font-medium text-slate-400 border-r dark:border-slate-800">Wk</div>
                            {WEEKDAYS.map(d => (
                                <div key={d} className="p-2 text-center text-sm font-medium text-slate-500 border-r last:border-0 dark:border-slate-800">{d}</div>
                            ))}
                        </div>

                        {weeks.map((week, wi) => (
                            <div key={wi} className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] border-b dark:border-slate-800">
                                <div className="flex items-start justify-center pt-2 text-[10px] text-slate-400 border-r dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                                    {getISOWeek(week[0])}
                                </div>
                                {week.map((day, i) => {
                                    const isCurrentMonth = isSameMonth(day, currentMonth);
                                    const stats = getDayStats(day);
                                    const weekend = day.getDay() === 0 || day.getDay() === 6;

                                    return (
                                        <button
                                            type="button"
                                            key={i}
                                            onClick={() => openDay(day)}
                                            title="Open dagplanning"
                                            className={`min-h-[118px] text-left flex flex-col p-1.5 border-r last:border-0 dark:border-slate-800 transition-colors hover:bg-blue-50/60 dark:hover:bg-slate-800/60
                                                ${!isCurrentMonth ? 'opacity-35' : ''}
                                                ${weekend ? 'bg-slate-50/70 dark:bg-slate-800/20' : 'bg-white dark:bg-slate-900'}
                                                ${stats.holiday ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}
                                                ${isToday(day) ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                                        >
                                            <div className="flex justify-between items-start gap-1 mb-1">
                                                <span className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full shrink-0
                                                    ${isToday(day) ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    {format(day, 'd')}
                                                </span>
                                                <div className="flex flex-col items-end min-w-0">
                                                    {stats.holiday && (
                                                        <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold text-right leading-tight truncate max-w-full" title={stats.holiday.localName}>
                                                            {stats.holiday.localName}
                                                        </span>
                                                    )}
                                                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                                        {stats.approved && <CheckCircle2 className="h-3 w-3 text-green-600" title="Goedgekeurd" />}
                                                        {!stats.approved && stats.submitted && <Lock className="h-3 w-3 text-amber-600" title="Ingediend" />}
                                                        {stats.expected > 0 && formatDuration(stats.expected)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex-1 space-y-0.5">
                                                {Object.entries(stats.byType).map(([type, mins]) => (
                                                    <div key={type} className={`px-1.5 py-0.5 rounded border text-[10px] flex justify-between gap-1 font-medium capitalize ${getTypeStyle(type)}`}>
                                                        <span className="truncate">{type}</span><span className="tabular-nums">{formatDuration(mins)}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {(stats.total > 0 || stats.expected > 0) && (
                                                <div className="mt-1 pt-1 flex justify-between items-center text-[10px] border-t dark:border-slate-800 w-full">
                                                    <span className="text-slate-400 tabular-nums">{formatDuration(stats.total)}</span>
                                                    {stats.diff !== 0 && (
                                                        <span className={`font-bold tabular-nums ${stats.diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                            {signed(stats.diff)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
