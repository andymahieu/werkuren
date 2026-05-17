import { useStore } from '../store/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const generateTimeOptions = () => {
    const options = [];
    for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 60; j += 30) {
            const hour = i.toString().padStart(2, '0');
            const minute = j.toString().padStart(2, '0');
            options.push(`${hour}:${minute}`);
        }
    }
    return options;
};

const TIME_OPTIONS = generateTimeOptions();

const DAY_LABELS = [
    'Maandag (Week 1)', 'Dinsdag (Week 1)', 'Woensdag (Week 1)', 'Donderdag (Week 1)', 'Vrijdag (Week 1)', 'Zaterdag (Week 1)', 'Zondag (Week 1)',
    'Maandag (Week 2)', 'Dinsdag (Week 2)', 'Woensdag (Week 2)', 'Donderdag (Week 2)', 'Vrijdag (Week 2)', 'Zaterdag (Week 2)', 'Zondag (Week 2)'
];

export default function Settings() {
    const { baseSchedule, updateBaseSchedule, employeeStartDate, setEmployeeStartDate, country, setCountry } = useStore();

    const handleToggleActive = (index) => {
        const current = baseSchedule[index];
        updateBaseSchedule(index, { ...current, active: !current.active });
    };

    const handleTimeChange = (index, field, value) => {
        const current = baseSchedule[index];
        updateBaseSchedule(index, { ...current, [field]: value });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Instellingen</h2>
                <p className="text-muted-foreground">Beheer je standaard 14-daagse werkrooster.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Gegevens werknemer</CardTitle>
                    <CardDescription>
                        Geef de startdatum op van de werknemer en selecteer het land voor feestdagen.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="startdate">Startdatum in dienst</Label>
                            <Input
                                type="date"
                                id="startdate"
                                value={employeeStartDate}
                                onChange={(e) => setEmployeeStartDate(e.target.value)}
                                className="w-full"
                            />
                            {employeeStartDate && (
                                <p className="text-xs text-muted-foreground">
                                    Rapportage start op {new Date(employeeStartDate).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="country">Land (voor feestdagen)</Label>
                            <select
                                id="country"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={country}
                                onChange={(e) => setCountry(e.target.value)}
                            >
                                <option value="BE">België</option>
                                <option value="NL">Nederland</option>
                                <option value="DE">Duitsland</option>
                                <option value="FR">Frankrijk</option>
                                <option value="LU">Luxemburg</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Basis 2-wekelijks Rooster</CardTitle>
                    <CardDescription>
                        Dit rooster wordt als uitgangspunt gebruikt. Als je niet werkt op een dag vink je hem uit.
                        Per dag kun je de normale start- en eindtijd bepalen, en aangeven of je een pauze hebt.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {baseSchedule.map((day, index) => (
                            <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg border bg-card">
                                <div className="flex items-center gap-3 w-48">
                                    <input
                                        type="checkbox"
                                        checked={day.active}
                                        onChange={() => handleToggleActive(index)}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        id={`day-${index}`}
                                    />
                                    <Label htmlFor={`day-${index}`} className="font-medium cursor-pointer">
                                        {DAY_LABELS[index]}
                                    </Label>
                                </div>

                                {day.active && (
                                    <div className="flex flex-col sm:flex-row gap-4 flex-1 mt-2 sm:mt-0">
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col gap-1 w-[110px]">
                                                <select
                                                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    value={day.start}
                                                    onChange={(e) => handleTimeChange(index, 'start', e.target.value)}
                                                >
                                                    {TIME_OPTIONS.map(time => (
                                                        <option key={`start-${time}`} value={time}>{time}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <span className="text-muted-foreground text-sm">tot</span>
                                            <div className="flex flex-col gap-1 w-[110px]">
                                                <select
                                                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                    value={day.end}
                                                    onChange={(e) => handleTimeChange(index, 'end', e.target.value)}
                                                >
                                                    {TIME_OPTIONS.map(time => (
                                                        <option key={`end-${time}`} value={time}>{time}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 sm:border-l sm:pl-4 border-slate-200 dark:border-slate-700 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 mt-2 sm:mt-0">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={day.hasBreak || false}
                                                    onChange={(e) => handleTimeChange(index, 'hasBreak', e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    id={`break-${index}`}
                                                />
                                                <Label htmlFor={`break-${index}`} className="font-medium cursor-pointer text-sm whitespace-nowrap">
                                                    Pauze
                                                </Label>
                                            </div>

                                            {day.hasBreak && (
                                                <div className="flex items-center gap-2 ml-1">
                                                    <div className="flex items-center gap-1">
                                                        <select
                                                            className="flex h-9 w-[85px] sm:w-[100px] items-center justify-between rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                            value={day.breakStart || '12:00'}
                                                            onChange={(e) => handleTimeChange(index, 'breakStart', e.target.value)}
                                                        >
                                                            {TIME_OPTIONS.map(time => (
                                                                <option key={`bstart-${time}`} value={time}>{time}</option>
                                                            ))}
                                                        </select>
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                        <select
                                                            className="flex h-9 w-[85px] sm:w-[100px] items-center justify-between rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                            value={day.breakEnd || '12:30'}
                                                            onChange={(e) => handleTimeChange(index, 'breakEnd', e.target.value)}
                                                        >
                                                            {TIME_OPTIONS.map(time => (
                                                                <option key={`bend-${time}`} value={time}>{time}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {!day.active && (
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-sm text-muted-foreground italic">Vrije dag</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
