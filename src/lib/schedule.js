// Roterend uurrooster (1 tot 4 weken) en verwachte uren.
import { startOfWeek, differenceInCalendarDays, parseISO } from 'date-fns';
import { toMinutes } from './time';

export const MAX_ROTATION_WEEKS = 4;

// Standaard ankerpunt: maandag 5 januari 2026 is "week 1" van de cyclus.
// Zo blijft het vroegere 2-wekenrooster (even ISO-week = week 1) in 2026 ongewijzigd.
const DEFAULT_ANCHOR = new Date(2026, 0, 5);

const clampWeeks = (n) => Math.min(MAX_ROTATION_WEEKS, Math.max(1, Number(n) || 1));

// Welke week van de cyclus (0-gebaseerd) valt deze datum in?
export function cycleWeekIndex(date, rotationWeeks = 2, rotationStartDate = '') {
    const weeks = clampWeeks(rotationWeeks);
    if (weeks === 1) return 0;
    let anchor = DEFAULT_ANCHOR;
    if (rotationStartDate) {
        const parsed = parseISO(rotationStartDate);
        if (!isNaN(parsed)) anchor = parsed;
    }
    const monday = startOfWeek(date, { weekStartsOn: 1 });
    const anchorMonday = startOfWeek(anchor, { weekStartsOn: 1 });
    const diffWeeks = Math.round(differenceInCalendarDays(monday, anchorMonday) / 7);
    return ((diffWeeks % weeks) + weeks) % weeks;
}

// Roosterdag voor een datum, rekening houdend met de rotatie
export function getScheduleForDate(date, baseSchedule, rotationWeeks = 2, rotationStartDate = '') {
    if (!baseSchedule || baseSchedule.length === 0) return undefined;
    const dayIdx = (date.getDay() + 6) % 7; // 0 = maandag
    const week = cycleWeekIndex(date, rotationWeeks, rotationStartDate);
    return baseSchedule[week * 7 + dayIdx] ?? baseSchedule[dayIdx];
}

// Geplande minuten (zonder pauze) van een roosterdag
export function plannedMinutes(day) {
    if (!day || !day.active) return 0;
    let mins = toMinutes(day.end) - toMinutes(day.start);
    if (day.hasBreak && day.breakStart && day.breakEnd) mins -= toMinutes(day.breakEnd) - toMinutes(day.breakStart);
    return Math.max(0, mins);
}

// Gemiddeld aantal uren per week over de hele cyclus
export function averageWeeklyHours(baseSchedule, rotationWeeks = 2) {
    const weeks = clampWeeks(rotationWeeks);
    const days = (baseSchedule || []).slice(0, weeks * 7);
    const total = days.reduce((sum, d) => sum + plannedMinutes(d), 0);
    return total / 60 / weeks;
}

// Types die niet als gewerkte/geregistreerde tijd tellen
export const isBreakType = (type) => (type || '').toLowerCase() === 'pauze';
export const isAbsenceType = (type) => ['ziekte', 'verlof', 'feestdag', 'afwezig'].includes((type || '').toLowerCase());
export const isOvertimeType = (type) => (type || '').toLowerCase() === 'overuur';
// Types waarvoor geen project gevraagd wordt (zelfde lijst als in api.php)
export const isNonProjectType = (type) => isBreakType(type) || isAbsenceType(type);
