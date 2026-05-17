import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { calculateDuration, calculateExpectedDuration } from '../lib/utils';
import { startOfWeek, endOfWeek, eachDayOfInterval, getISOWeek, format, startOfMonth, endOfMonth, subWeeks, subMonths } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function Reports() {
    const { overtimeBalance, setOvertimeBalance, addOvertime, registrations, baseSchedule, employeeStartDate } = useStore();
    const [balanceInput, setBalanceInput] = useState(overtimeBalance.toString());

    // Effective start: parse the stored date string, or null when not set
    const effectiveStart = employeeStartDate ? new Date(employeeStartDate) : null;

    const handleSave = () => {
        setOvertimeBalance(parseFloat(balanceInput) || 0);
    };

    const calculateStatsForInterval = (start, end) => {
        // If an employee start date is set, clamp the interval start to that date
        const clampedStart = effectiveStart && effectiveStart > start ? effectiveStart : start;
        if (clampedStart > end) return { expected: 0, actual: 0, diff: 0 };

        const days = eachDayOfInterval({ start: clampedStart, end });
        let expected = 0;
        let actual = 0;

        days.forEach(day => {
            // expected
            const weekNumber = getISOWeek(day);
            const isWeek2 = weekNumber % 2 !== 0;
            let dayIndex = day.getDay() - 1;
            if (dayIndex < 0) dayIndex = 6;

            const scheduleIndex = isWeek2 ? dayIndex + 7 : dayIndex;
            const baseDay = baseSchedule[scheduleIndex];
            const ex = baseDay?.active ? calculateExpectedDuration(baseDay) : 0;
            expected += ex;

            // actual
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayRegs = registrations.filter(r => r.date === dateStr);
            let dayTotal = 0;
            dayRegs.forEach(reg => {
                if (reg.type !== 'pauze') {
                    dayTotal += calculateDuration(reg.start, reg.end);
                }
            });
            actual += dayTotal;
        });

        return { expected, actual, diff: actual - expected };
    };

    const now = new Date();
    const currentWeekStats = useMemo(() => calculateStatsForInterval(startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })), [registrations, baseSchedule, now]);
    const lastWeekDate = subWeeks(now, 1);
    const lastWeekStats = useMemo(() => calculateStatsForInterval(startOfWeek(lastWeekDate, { weekStartsOn: 1 }), endOfWeek(lastWeekDate, { weekStartsOn: 1 })), [registrations, baseSchedule, lastWeekDate]);

    const currentMonthStats = useMemo(() => calculateStatsForInterval(startOfMonth(now), endOfMonth(now)), [registrations, baseSchedule, now]);
    const lastMonthDate = subMonths(now, 1);
    const lastMonthStats = useMemo(() => calculateStatsForInterval(startOfMonth(lastMonthDate), endOfMonth(lastMonthDate)), [registrations, baseSchedule, lastMonthDate]);

    const StatBlock = ({ title, stats }) => (
        <div className="flex flex-col space-y-1 p-3 border rounded-md bg-slate-50 dark:bg-slate-800/50">
            <span className="text-xs sm:text-sm font-medium text-slate-500">{title}</span>
            <div className="flex justify-between items-end gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold">{stats.actual}u</span>
                    <span className="text-[10px] sm:text-xs text-slate-500 whitespace-nowrap">/ {stats.expected}u rooster</span>
                </div>
                <div className={`font-bold text-sm sm:text-base ${stats.diff > 0 ? 'text-green-600 dark:text-green-400' : stats.diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
                    {stats.diff > 0 ? '+' : ''}{stats.diff}u
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Rapportage</h2>
                <p className="text-muted-foreground">Inzicht in wekelijkse en maandelijkse geregistreerde uren.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* OVERTIME CARD */}
                <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                    <CardHeader>
                        <CardTitle className="text-blue-900 dark:text-blue-100">Actueel Overurensaldo</CardTitle>
                        <CardDescription className="text-blue-700/80 dark:text-blue-300">
                            Dit is het totaal van alle over- en minuren plus handmatige correcties.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl sm:text-5xl font-bold text-blue-600 dark:text-blue-400 mb-6">{overtimeBalance} <span className="text-xl sm:text-2xl text-blue-400">uur</span></div>

                        <div className="space-y-3 pt-4 border-t border-blue-200/50 dark:border-blue-800/50">
                            <Label className="text-blue-900 dark:text-blue-100">Handmatige correctie of startsaldo</Label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Input
                                    type="number"
                                    step="0.5"
                                    value={balanceInput}
                                    onChange={(e) => setBalanceInput(e.target.value)}
                                    className="bg-white dark:bg-slate-900 w-full sm:w-32 font-bold"
                                />
                                <Button onClick={handleSave} variant="default" className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto">Opslaan</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* STATS CARD */}
                <Card>
                    <CardHeader>
                        <CardTitle>Overzichten</CardTitle>
                        <CardDescription>
                            Gewerkte/geregistreerde uren in vergelijking met het basisrooster.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <StatBlock title="Huidige Week" stats={currentWeekStats} />
                        <StatBlock title="Huidige Maand" stats={currentMonthStats} />

                        <div className="pt-4 mt-4 border-t">
                            <h4 className="text-sm font-bold mb-3 text-slate-700 dark:text-slate-300">Afgelopen periodes</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <StatBlock title="Vorige Week" stats={lastWeekStats} />
                                <StatBlock title="Vorige Maand" stats={lastMonthStats} />
                            </div>
                        </div>

                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
