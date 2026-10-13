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
    let r = db.prepare(`
        SELECT s.*, e.time_step as e_time_step, e.allow_deviate_time_step, e.schedule_rotation_weeks, e.approval_required, e.custom_registration_types, e.auto_split_overtime, e.allow_manual_split_overtime 
        FROM settings s 
        LEFT JOIN users u ON s.user_id = u.id 
        LEFT JOIN entity_settings e ON u.entity_id = e.entity_id 
        WHERE s.user_id = ?
    `).get(req.user.id);

    if (!r) {
        db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(req.user.id);
        r = db.prepare(`
            SELECT s.*, e.time_step as e_time_step, e.allow_deviate_time_step, e.schedule_rotation_weeks, e.approval_required, e.custom_registration_types, e.auto_split_overtime, e.allow_manual_split_overtime 
            FROM settings s 
            LEFT JOIN users u ON s.user_id = u.id 
            LEFT JOIN entity_settings e ON u.entity_id = e.entity_id 
            WHERE s.user_id = ?
        `).get(req.user.id);
    }

    res.json({ 
        overtimeBalance: r.overtime_balance ?? 0, 
        employeeStartDate: r.employee_start_date ?? '',
        country: r.country ?? 'BE',
        timeStep: r.time_step ?? 30,
        entityTimeStep: r.e_time_step ?? 30,
        allowDeviateTimeStep: !!r.allow_deviate_time_step,
        scheduleRotationWeeks: r.schedule_rotation_weeks ?? 2,
        approvalRequired: r.approval_required ?? 'none',
        customRegistrationTypes: r.custom_registration_types ?? 'Werk,Pauze,Ziekte,Verlof',
        autoSplitOvertime: !!r.auto_split_overtime,
        allowManualSplitOvertime: r.allow_manual_split_overtime !== undefined ? !!r.allow_manual_split_overtime : true,
        defaultProjectId: r.default_project_id,
        defaultSubjectId: r.default_subject_id
    });
});

router.put('/settings', auth, (req, res) => {
    const { overtimeBalance, employeeStartDate, country, timeStep } = req.body;
    db.prepare(`
        INSERT INTO settings (user_id, overtime_balance, employee_start_date, country, time_step)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET 
            overtime_balance=excluded.overtime_balance, 
            employee_start_date=excluded.employee_start_date,
            country=excluded.country,
            time_step=excluded.time_step
    `).run(req.user.id, overtimeBalance ?? 0, employeeStartDate ?? '', country ?? 'BE', timeStep ?? 30);
    res.json({ ok: true });
});

export default router;
