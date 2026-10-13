import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'werkuren.db'));

// Enable WAL for better performance
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        entity_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS entity_settings (
        entity_id INTEGER PRIMARY KEY,
        time_step INTEGER DEFAULT 30,
        allow_deviate_time_step INTEGER DEFAULT 0,
        schedule_rotation_weeks INTEGER DEFAULT 2,
        approval_required TEXT DEFAULT 'none',
        custom_registration_types TEXT DEFAULT 'Werk,Pauze,Ziekte,Verlof',
        auto_split_overtime INTEGER DEFAULT 0,
        allow_manual_split_overtime INTEGER DEFAULT 1,
        FOREIGN KEY (entity_id) REFERENCES entities(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (entity_id) REFERENCES entities(id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        start TEXT NOT NULL,
        end TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'werk',
        description TEXT DEFAULT '',
        project_id INTEGER,
        subject_id INTEGER,
        status TEXT DEFAULT 'draft',
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS base_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        day_index INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        start TEXT NOT NULL DEFAULT '08:00',
        end TEXT NOT NULL DEFAULT '15:30',
        has_break INTEGER NOT NULL DEFAULT 1,
        break_start TEXT NOT NULL DEFAULT '12:00',
        break_end TEXT NOT NULL DEFAULT '12:30',
        UNIQUE(user_id, day_index),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
        user_id INTEGER PRIMARY KEY,
        overtime_balance REAL NOT NULL DEFAULT 0,
        employee_start_date TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT 'BE',
        time_step INTEGER DEFAULT 30,
        default_project_id INTEGER,
        default_subject_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`);

const migrations = [
    "ALTER TABLE settings ADD COLUMN time_step INTEGER DEFAULT 30;",
    "ALTER TABLE settings ADD COLUMN default_project_id INTEGER;",
    "ALTER TABLE settings ADD COLUMN default_subject_id INTEGER;",
    "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';",
    "ALTER TABLE users ADD COLUMN entity_id INTEGER;",
    "ALTER TABLE registrations ADD COLUMN project_id INTEGER;",
    "ALTER TABLE registrations ADD COLUMN subject_id INTEGER;",
    "ALTER TABLE registrations ADD COLUMN status TEXT DEFAULT 'draft';",
    "ALTER TABLE entity_settings ADD COLUMN custom_registration_types TEXT DEFAULT 'Werk,Pauze,Ziekte,Verlof';",
    "ALTER TABLE entity_settings ADD COLUMN auto_split_overtime INTEGER DEFAULT 0;",
    "ALTER TABLE entity_settings ADD COLUMN allow_manual_split_overtime INTEGER DEFAULT 1;"
];

for (const query of migrations) {
    try {
        db.exec(query);
    } catch (err) {}
}

export default db;
