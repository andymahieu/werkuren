// Gedeelde tijd-hulpfuncties. Alle tijden in de app zijn "HH:MM".

// Zet eender welke tijdnotatie ("8:5", "08:05:00", "11:015", "1115") om naar "HH:MM".
export const formatTime = (timeStr) => {
    if (timeStr === null || timeStr === undefined) return '';
    const s = String(timeStr).trim();
    if (!s) return '';
    let h;
    let m;
    const match = s.match(/^(\d{1,2})\s*[:.hu]\s*(\d{1,3})/i);
    if (match) {
        h = parseInt(match[1], 10);
        m = parseInt(match[2], 10);
    } else if (/^\d{3,4}$/.test(s)) {
        h = parseInt(s.slice(0, -2), 10);
        m = parseInt(s.slice(-2), 10);
    } else {
        return s;
    }
    if (isNaN(h) || isNaN(m)) return s;
    if (m > 59) m = m % 100 > 59 ? 59 : m % 100;
    h = Math.min(Math.max(h, 0), 24);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const toMinutes = (t) => {
    const [h, m] = formatTime(t).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

export const toTime = (mins) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Zorgt dat de huidige waarde altijd in de keuzelijst staat (bv. 11:15 bij een stap van 30 min).
export const withValue = (options, value) => {
    const v = formatTime(value);
    if (!v || options.includes(v)) return options;
    return [...options, v].sort();
};

export const normalizeRegistration = (r) => ({
    ...r,
    start: formatTime(r.start),
    end: formatTime(r.end),
});

export const normalizeScheduleDay = (d) => ({
    ...d,
    start: formatTime(d.start),
    end: formatTime(d.end),
    breakStart: d.breakStart ? formatTime(d.breakStart) : d.breakStart,
    breakEnd: d.breakEnd ? formatTime(d.breakEnd) : d.breakEnd,
});
