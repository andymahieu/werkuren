import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, format, isSameMonth, isToday, addMonths, subMonths, getISOWeek
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { calculateDuration, calculateExpectedDuration } from '../lib/utils';
import { ScrollArea } from '../components/ui/scroll-area';

export default function MonthCalendar() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const { registrations, baseSchedule, holidays } = useStore();

    const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

    const days = useMemo(() => {
        const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
        return eachDayOfInterval({ start, end });
    }, [currentMonth]);

    const getDayStats = (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayRegs = registrations.filter(r => r.date === dateStr);
        const holiday = holidays.find(h => h.date === dateStr);

        // Calculate expected base schedule hours
        const weekNumber = getISOWeek(date);
        const isWeek2 = weekNumber % 2 !== 0;
        let dayIndex = date.getDay() - 1;
        if (dayIndex < 0) dayIndex = 6;

        const scheduleIndex = isWeek2 ? dayIndex + 7 : dayIndex;
        const baseDay = baseSchedule[scheduleIndex];
        const expectedHours = baseDay?.active ? calculateExpectedDuration(baseDay) : 0;

        let werkHours = 0;
        let ziekteHours = 0;
        let verlofHours = 0;
        let pauzeHours = 0;

        dayRegs.forEach(reg => {
            const duration = calculateDuration(reg.start, reg.end);
            if (reg.type === 'werk') werkHours += duration;
            if (reg.type === 'ziekte') ziekteHours += duration;
            if (reg.type === 'verlof') verlofHours += duration;
            if (reg.type === 'pauze') pauzeHours += duration;
        });

        const totalRegistered = werkHours + ziekteHours + verlofHours;
        const diff = totalRegistered - expectedHours;

        return {
            expected: expectedHours,
            werk: werkHours,
            ziekte: ziekteHours,
            verlof: verlofHours,
            pauze: pauzeHours,
            total: totalRegistered,
            diff: diff,
            holiday: holiday
        };
    };

    const monthTotals = useMemo(() => {
        const currentMonthDays = days.filter(d => isSameMonth(d, currentMonth));
        return currentMonthDays.reduce((acc, day) => {
            const stats = getDayStats(day);
            acc.expected += stats.expected;
            acc.werk += stats.werk;
            acc.ziekte += stats.ziekte;
            acc.verlof += stats.verlof;
            acc.total += stats.total;
            acc.diff += stats.diff;
            return acc;
        }, { expected: 0, werk: 0, ziekte: 0, verlof: 0, total: 0, diff: 0 });
    }, [days, registrations, baseSchedule, currentMonth, holidays]);

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-lg shadow border dark:border-slate-800 overflow-hidden">

            {/* HEADER */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b dark:border-slate-800 gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={handlePrevMonth} className="h-8 w-8">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-xl font-bold w-48 text-center capitalize">
                        {format(currentMonth, 'MMMM yyyy', { locale: nl })}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleNextMonth} className="h-8 w-8">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex flex-wrap gap-2 sm:gap-4 text-xs">
                    <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border dark:border-slate-700">
                        <span className="text-slate-500 block">Gewerkte uren</span>
                        <span className="font-bold text-sm">{monthTotals.werk}u</span>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border dark:border-slate-700">
                        <span className="text-slate-500 block">Afwezigheid</span>
                        <span className="font-bold text-sm">{monthTotals.ziekte + monthTotals.verlof}u</span>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border dark:border-slate-700">
                        <span className="text-slate-500 block">Saldo</span>
                        <span className={`font-bold text-sm ${monthTotals.diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {monthTotals.diff > 0 ? '+' : ''}{monthTotals.diff}u
                        </span>
                    </div>
                </div>
            </div>

            {/* CALENDAR GRID */}
            <div className="flex-1 flex flex-col min-h-0">
                {/* Days of week header */}
                <div className="grid grid-cols-7 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    {['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'].map(d => (
                        <div key={d} className="p-3 text-center text-sm font-medium text-slate-500 border-r last:border-0 dark:border-slate-800">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Days grid main */}
                <ScrollArea className="flex-1">
                    <div className="grid grid-cols-7 auto-rows-[140px] bg-slate-100 dark:bg-slate-800 gap-[1px] border-b dark:border-slate-800">
                        {days.map((day, i) => {
                            const isCurrentMonth = isSameMonth(day, currentMonth);
                            const stats = getDayStats(day);

                            return (
                                <div
                                    key={i}
                                    className={`bg-white dark:bg-slate-900 flex flex-col p-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 relative
                                        ${!isCurrentMonth ? 'opacity-30' : ''}
                                        ${isToday(day) ? 'ring-2 ring-inset ring-blue-500 z-10' : ''}
                                        ${day.getDay() === 0 || day.getDay() === 6 ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}
                                        ${stats.holiday ? 'bg-amber-50/20 dark:bg-amber-900/10' : ''}
                                    `}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                                            ${isToday(day) ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                            {format(day, 'd')}
                                        </span>
                                        <div className="flex flex-col items-end">
                                            {stats.holiday && (
                                                <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold text-right leading-tight max-w-[80px] break-words">
                                                    {stats.holiday.localName}
                                                </span>
                                            )}
                                            {stats.expected > 0 && isCurrentMonth && (
                                                <span className="text-[10px] text-slate-400 mt-1">
                                                    {stats.expected}u
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto space-y-1 mt-1">
                                        {stats.werk > 0 && (
                                            <div className="bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded text-[10px] flex justify-between font-medium">
                                                <span>Werk</span><span>{stats.werk}u</span>
                                            </div>
                                        )}
                                        {(stats.ziekte > 0 || stats.verlof > 0) && (
                                            <div className="bg-purple-50 text-purple-700 border border-purple-100 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800 px-1.5 py-0.5 rounded text-[10px] flex justify-between font-medium">
                                                <span>Afwezig</span><span>{stats.ziekte + stats.verlof}u</span>
                                            </div>
                                        )}
                                        {stats.pauze > 0 && (
                                            <div className="bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800 px-1.5 py-0.5 rounded text-[10px] flex justify-between font-medium">
                                                <span>Pauze</span><span>{stats.pauze}u</span>
                                            </div>
                                        )}
                                    </div>

                                    {isCurrentMonth && (stats.total > 0 || stats.expected > 0) && (
                                        <div className="mt-auto pt-1 flex justify-between items-center text-[10px] border-t dark:border-slate-800">
                                            <span className="text-slate-400">Tot: {stats.total}u</span>
                                            {stats.expected > 0 && stats.diff !== 0 && (
                                                <span className={`font-bold ${stats.diff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                    {stats.diff > 0 ? '+' : ''}{stats.diff}u
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
