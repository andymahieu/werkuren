import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import bcrypt from 'bcryptjs';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'werkuren-secret-change-in-production';

function auth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'Geen token.' });
    const token = header.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        if (!user) return res.status(401).json({ error: 'Gebruiker bestaat niet meer.' });
        req.user = user;
        next();
    } catch {
        res.status(401).json({ error: 'Ongeldig token.' });
    }
}

function requireSuperAdmin(req, res, next) {
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super Admin rechten vereist.' });
    }
    next();
}

function requireEntityAdmin(req, res, next) {
    if (req.user.role !== 'super_admin' && req.user.role !== 'entity_admin') {
        return res.status(403).json({ error: 'Entity Admin rechten vereist.' });
    }
    next();
}

// ==========================================
// SUPER ADMIN: COMPANIES & ENTITIES
// ==========================================
router.get('/companies', auth, requireSuperAdmin, (req, res) => {
    const companies = db.prepare('SELECT * FROM companies').all();
    res.json(companies);
});

router.post('/companies', auth, requireSuperAdmin, (req, res) => {
    const info = db.prepare('INSERT INTO companies (name) VALUES (?)').run(req.body.name);
    res.json({ id: info.lastInsertRowid, name: req.body.name });
});

router.get('/entities', auth, requireSuperAdmin, (req, res) => {
    const entities = db.prepare('SELECT e.*, c.name as company_name FROM entities e JOIN companies c ON e.company_id = c.id').all();
    res.json(entities);
});

router.post('/entities', auth, requireSuperAdmin, (req, res) => {
    const { name, company_id } = req.body;
    const info = db.prepare('INSERT INTO entities (name, company_id) VALUES (?, ?)').run(name, company_id);
    db.prepare('INSERT INTO entity_settings (entity_id) VALUES (?)').run(info.lastInsertRowid);
    res.json({ id: info.lastInsertRowid, name, company_id });
});

// ==========================================
// ENTITY ADMIN: USERS, SETTINGS, PROJECTS
// ==========================================
router.get('/users', auth, requireEntityAdmin, (req, res) => {
    let users = [];
    if (req.user.role === 'super_admin') {
        users = db.prepare('SELECT id, username, role, entity_id, created_at FROM users').all();
    } else {
        users = db.prepare('SELECT id, username, role, entity_id, created_at FROM users WHERE entity_id = ?').all(req.user.entity_id);
    }
    res.json(users);
});

router.post('/users', auth, requireEntityAdmin, (req, res) => {
    const { username, password, role, entity_id } = req.body;
    const targetEntityId = req.user.role === 'super_admin' ? entity_id : req.user.entity_id;
    const targetRole = (req.user.role !== 'super_admin' && role === 'super_admin') ? 'user' : (role || 'user');

    try {
        const hash = bcrypt.hashSync(password, 10);
        const info = db.prepare('INSERT INTO users (username, password_hash, role, entity_id) VALUES (?, ?, ?, ?)').run(username, hash, targetRole, targetEntityId);
        
        const userId = info.lastInsertRowid;
        const schedStmt = db.prepare('INSERT INTO base_schedule (user_id, day_index, active) VALUES (?, ?, ?)');
        for(let i=0; i<14; i++) {
            schedStmt.run(userId, i, (i % 7 >= 0 && i % 7 <= 3) ? 1 : 0);
        }
        db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(userId);

        res.json({ id: userId, username, role: targetRole, entity_id: targetEntityId });
    } catch(err) {
        res.status(400).json({ error: 'Fout bij aanmaken gebruiker (bestaat de gebruikersnaam al?)' });
    }
});

router.get('/entity-settings', auth, requireEntityAdmin, (req, res) => {
    const targetEntityId = req.user.role === 'super_admin' ? req.query.entity_id : req.user.entity_id;
    if (!targetEntityId) return res.status(400).json({ error: 'Geen entity_id' });

    let settings = db.prepare('SELECT * FROM entity_settings WHERE entity_id = ?').get(targetEntityId);
    if (!settings) {
        db.prepare('INSERT INTO entity_settings (entity_id) VALUES (?)').run(targetEntityId);
        settings = db.prepare('SELECT * FROM entity_settings WHERE entity_id = ?').get(targetEntityId);
    }
    res.json(settings);
});

router.put('/entity-settings', auth, requireEntityAdmin, (req, res) => {
    const targetEntityId = req.user.role === 'super_admin' ? req.body.entity_id : req.user.entity_id;
    const { time_step, allow_deviate_time_step, schedule_rotation_weeks, approval_required, custom_registration_types, auto_split_overtime } = req.body;
    
    db.prepare(`
        UPDATE entity_settings 
        SET time_step=?, allow_deviate_time_step=?, schedule_rotation_weeks=?, approval_required=?, custom_registration_types=?, auto_split_overtime=?
        WHERE entity_id=?
    `).run(time_step, allow_deviate_time_step ? 1 : 0, schedule_rotation_weeks, approval_required, custom_registration_types, auto_split_overtime ? 1 : 0, targetEntityId);
    
    res.json({ ok: true });
});

// ==========================================
// PROJECTS & SUBJECTS
// ==========================================
router.get('/projects', auth, requireEntityAdmin, (req, res) => {
    const entityId = req.user.role === 'super_admin' ? req.query.entity_id : req.user.entity_id;
    const projects = db.prepare('SELECT * FROM projects WHERE entity_id = ? ORDER BY name').all(entityId);
    res.json(projects);
});

router.post('/projects', auth, requireEntityAdmin, (req, res) => {
    const entityId = req.user.role === 'super_admin' ? req.body.entity_id : req.user.entity_id;
    const info = db.prepare('INSERT INTO projects (entity_id, name, is_active) VALUES (?, ?, 1)').run(entityId, req.body.name);
    res.json({ id: info.lastInsertRowid, entity_id: entityId, name: req.body.name, is_active: 1 });
});

router.put('/projects/:id', auth, requireEntityAdmin, (req, res) => {
    const { name, is_active } = req.body;
    db.prepare('UPDATE projects SET name=?, is_active=? WHERE id=?').run(name, is_active ? 1 : 0, req.params.id);
    res.json({ ok: true });
});

router.delete('/projects/:id', auth, requireEntityAdmin, (req, res) => {
    db.prepare('DELETE FROM subjects WHERE project_id=?').run(req.params.id);
    db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

router.get('/subjects', auth, requireEntityAdmin, (req, res) => {
    const projectId = req.query.project_id;
    const rows = projectId
        ? db.prepare('SELECT * FROM subjects WHERE project_id = ? ORDER BY name').all(projectId)
        : db.prepare(`
            SELECT s.*, p.name as project_name FROM subjects s 
            JOIN projects p ON s.project_id = p.id 
            JOIN entities e ON p.entity_id = e.id 
            WHERE e.id = ?
        `).all(req.user.entity_id);
    res.json(rows);
});

router.post('/subjects', auth, requireEntityAdmin, (req, res) => {
    const info = db.prepare('INSERT INTO subjects (project_id, name, is_active) VALUES (?, ?, 1)').run(req.body.project_id, req.body.name);
    res.json({ id: info.lastInsertRowid, project_id: req.body.project_id, name: req.body.name, is_active: 1 });
});

router.put('/subjects/:id', auth, requireEntityAdmin, (req, res) => {
    const { name, is_active } = req.body;
    db.prepare('UPDATE subjects SET name=?, is_active=? WHERE id=?').run(name, is_active ? 1 : 0, req.params.id);
    res.json({ ok: true });
});

router.delete('/subjects/:id', auth, requireEntityAdmin, (req, res) => {
    db.prepare('DELETE FROM subjects WHERE id=?').run(req.params.id);
    res.json({ ok: true });
});

export default router;
