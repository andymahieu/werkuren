import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'werkuren-secret-change-in-production';

// Default base schedule: Mon-Thu active for both weeks
function createDefaultSchedule(userId) {
    const days = Array.from({ length: 14 }, (_, i) => {
        const dayOfWeek = i % 7;
        const isActive = dayOfWeek >= 0 && dayOfWeek <= 3 ? 1 : 0;
        return { dayIndex: i, active: isActive };
    });
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO base_schedule (user_id, day_index, active, start, end, has_break, break_start, break_end)
        VALUES (?, ?, ?, '08:00', '15:30', ?, '12:00', '12:30')
    `);
    const insertMany = db.transaction((rows) => {
        for (const row of rows) {
            stmt.run(userId, row.dayIndex, row.active, row.active);
        }
    });
    insertMany(days);

    db.prepare(`INSERT OR IGNORE INTO settings (user_id) VALUES (?)`).run(userId);
}

// POST /api/auth/register
router.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
        return res.status(409).json({ error: 'Gebruikersnaam bestaat al.' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    createDefaultSchedule(result.lastInsertRowid);
    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastInsertRowid, username } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Ongeldige gebruikersnaam of wachtwoord.' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
});

export default router;
