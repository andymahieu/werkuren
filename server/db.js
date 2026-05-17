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
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        start TEXT NOT NULL,
        end TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'werk',
        description TEXT DEFAULT '',
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
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`);

export default db;
