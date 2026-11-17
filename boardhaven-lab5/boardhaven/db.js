'use strict';
// База даних SQLite (вбудований модуль node:sqlite, Node.js >= 22.13).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const GAMES = [
  ['catan', 'Catan', 3, 4, 90, 2],
  ['dixit', 'Dixit', 3, 8, 30, 1],
  ['pandemic', 'Pandemic', 2, 4, 60, 3],
  ['carcassonne', 'Carcassonne', 2, 5, 45, 2],
  ['codenames', 'Codenames', 4, 8, 20, 1],
  ['wingspan', 'Wingspan', 1, 5, 60, 3]
];
const TABLES = [[1, 2], [2, 4], [3, 4], [4, 6], [5, 8], [6, 8]];

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      min_players INTEGER NOT NULL,
      max_players INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      difficulty INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY,
      capacity INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      game_id TEXT NOT NULL REFERENCES games(id),
      table_id INTEGER NOT NULL REFERENCES tables(id),
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      guests INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- Один стіл не можна двічі забронювати на той самий час (захист від гонки запитів)
    CREATE UNIQUE INDEX IF NOT EXISTS ux_booking_slot
      ON bookings (table_id, date, time) WHERE status = 'confirmed';
    CREATE INDEX IF NOT EXISTS ix_booking_owner ON bookings (owner);
  `);
  const g = db.prepare('INSERT OR IGNORE INTO games VALUES (?, ?, ?, ?, ?, ?)');
  GAMES.forEach((x) => g.run(...x));
  const t = db.prepare('INSERT OR IGNORE INTO tables VALUES (?, ?)');
  TABLES.forEach((x) => t.run(...x));
  return db;
}

module.exports = { openDb };
