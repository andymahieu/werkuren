import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { randomUUID } from 'crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'werkuren-secret-change-in-production';

// Auth middleware
function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'Geen token.' });
    const token = header.split(' ')[1];
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Ongeldig token.' });
    }
}

// ─── REGISTRATIONS ───────────────────────────────────────────────────────────

router.get('/registrations', auth, (req, res) => {
    const rows = db.prepare('SELECT * FROM registrations WHERE user_id = ?').all(req.user.id);
    res.json(rows);
});

router.post('/registrations', auth, (req, res) => {
    const { date, start, end, type, description } = req.body;
    const id = randomUUID();
    db.prepare('INSERT INTO registrations (id, user_id, date, start, end, type, description) VALUES (?,?,?,?,?,?,?)')
        .run(id, req.user.id, date, start, end, type || 'werk', description || '');
    res.json({ id, date, start, end, type, description });
});

router.post('/registrations/bulk', auth, (req, res) => {
    const regs = req.body; // array
    const stmt = db.prepare('INSERT INTO registrations (id, user_id, date, start, end, type, description) VALUES (?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => {
        for (const r of rows) {
            const id = randomUUID();
            stmt.run(id, req.user.id, r.date, r.start, r.end, r.type || 'werk', r.description || '');
        }
    });
    insertMany(regs);
    const all = db.prepare('SELECT * FROM registrations WHERE user_id = ?').all(req.user.id);
    res.json(all);
});

router.put('/registrations/:id', auth, (req, res) => {
    const { date, start, end, type, description } = req.body;
    db.prepare('UPDATE registrations SET date=?, start=?, end=?, type=?, description=? WHERE id=? AND user_id=?')
        .run(date, start, end, type, description || '', req.params.id, req.user.id);
    res.json({ ok: true });
});

router.delete('/registrations/:id', auth, (req, res) => {
    db.prepare('DELETE FROM registrations WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    res.json({ ok: true });
});

// ─── BASE SCHEDULE ────────────────────────────────────────────────────────────

router.get('/base-schedule', auth, (req, res) => {
    const rows = db.prepare('SELECT * FROM base_schedule WHERE user_id = ? ORDER BY day_index').all(req.user.id);
    res.json(rows.map(r => ({
        active: !!r.active,
        start: r.start,
        end: r.end,
        hasBreak: !!r.has_break,
        breakStart: r.break_start,
        breakEnd: r.break_end,
    })));
});

router.put('/base-schedule/:dayIndex', auth, (req, res) => {
    const { active, start, end, hasBreak, breakStart, breakEnd } = req.body;
    db.prepare(`
        UPDATE base_schedule
        SET active=?, start=?, end=?, has_break=?, break_start=?, break_end=?
        WHERE user_id=? AND day_index=?
    `).run(active ? 1 : 0, start, end, hasBreak ? 1 : 0, breakStart || '12:00', breakEnd || '12:30', req.user.id, req.params.dayIndex);
    res.json({ ok: true });
});

// ─── SETTINGS ────────────────────────────────────────────────────────────────

router.get('/settings', auth, (req, res) => {
    const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
    res.json({ 
        overtimeBalance: row?.overtime_balance ?? 0, 
        employeeStartDate: row?.employee_start_date ?? '',
        country: row?.country ?? 'BE'
    });
});

router.put('/settings', auth, (req, res) => {
    const { overtimeBalance, employeeStartDate, country } = req.body;
    db.prepare(`
        INSERT INTO settings (user_id, overtime_balance, employee_start_date, country)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET 
            overtime_balance=excluded.overtime_balance, 
            employee_start_date=excluded.employee_start_date,
            country=excluded.country
    `).run(req.user.id, overtimeBalance ?? 0, employeeStartDate ?? '', country ?? 'BE');
    res.json({ ok: true });
});

export default router;
