'use strict';
// Бізнес-логіка та валідація (без залежності від Express, тому легко тестується).
const TIMES = ['14:00', '16:00', '18:00', '20:00'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DAYS_AHEAD = 14;
const MIN_CANCEL_MINUTES = 120;

class ApiError extends Error {
  constructor(status, code, message, errors) {
    super(message);
    this.status = status; this.code = code; this.errors = errors;
  }
}

// Поточні дата й час у Києві (сервер може працювати в іншому часовому поясі)
function kyivNow(now) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).forEach((x) => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}
const slotMinutes = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function validateGuests(guests, game, table, errors) {
  const n = Number(guests);
  if (guests === '' || guests == null || !Number.isInteger(n)) errors.guests = 'Вкажіть кількість гравців цілим числом';
  else if (n < game.min_players || n > game.max_players) errors.guests = `Для ${game.name} потрібно від ${game.min_players} до ${game.max_players} гравців`;
  else if (table && n > table.capacity) errors.guests = `За цим столом вміщається до ${table.capacity} осіб`;
  return n;
}

function validateBooking(db, input, now = new Date()) {
  const errors = {};
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(str(input.game));
  if (!game) errors.game = 'Оберіть гру зі списку';

  const date = str(input.date), time = str(input.time);
  const today = kyivNow(now);
  if (!isDate(date)) errors.date = 'Вкажіть дату у форматі РРРР-ММ-ДД';
  else if (date < today.date) errors.date = 'Дата не може бути в минулому';
  else if ((Date.parse(date) - Date.parse(today.date)) / 864e5 > MAX_DAYS_AHEAD) errors.date = `Бронювання доступне не далі ніж на ${MAX_DAYS_AHEAD} днів уперед`;
  if (!TIMES.includes(time)) errors.time = 'Оберіть час зі списку';
  else if (!errors.date && date === today.date && slotMinutes(time) <= today.minutes) errors.time = 'Цей час уже минув';

  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(Number(input.table));
  if (!table) errors.table = 'Оберіть стіл зі списку';
  const guests = game ? validateGuests(input.guests, game, table, errors) : Number(input.guests);

  const name = str(input.name);
  if (!/^[\p{L}' -]{2,40}$/u.test(name)) errors.name = 'Ім’я: 2–40 літер, без цифр';
  const phone = str(input.phone).replace(/[\s()-]/g, '');
  if (!/^\+380\d{9}$/.test(phone)) errors.phone = 'Формат телефону: +380 XX XXX XX XX';

  if (Object.keys(errors).length) throw new ApiError(400, 'validation', 'Перевірте введені дані', errors);
  return { game: game.id, table: table.id, date, time, guests, name, phone };
}

const dto = (r) => ({
  id: Number(r.id), game: r.game_name, gameId: r.game_id, table: Number(r.table_id),
  date: r.date, time: r.time, guests: Number(r.guests), name: r.name, status: r.status
});
const SELECT = `SELECT b.*, g.name AS game_name FROM bookings b JOIN games g ON g.id = b.game_id`;

function findOwned(db, owner, id) {
  const row = Number.isInteger(id) ? db.prepare(`${SELECT} WHERE b.id = ? AND b.owner = ?`).get(id, owner) : null;
  if (!row) throw new ApiError(404, 'not_found', 'Бронювання не знайдено');
  return row;
}

// ----- CRUD бронювань -----
function createBooking(db, owner, input, now = new Date()) {
  const b = validateBooking(db, input, now);
  try {
    const r = db.prepare(`INSERT INTO bookings (owner, game_id, table_id, date, time, guests, name, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(owner, b.game, b.table, b.date, b.time, b.guests, b.name, b.phone);
    return dto(findOwned(db, owner, Number(r.lastInsertRowid)));
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) throw new ApiError(409, 'table_busy', 'Цей стіл уже заброньовано на обраний час. Оберіть інший.');
    throw e;
  }
}

function listBookings(db, owner) {
  return db.prepare(`${SELECT} WHERE b.owner = ? ORDER BY b.id DESC`).all(owner).map(dto);
}

function updateBooking(db, owner, id, patch, now = new Date()) {
  const row = findOwned(db, owner, id);
  const hasStatus = patch.status !== undefined, hasGuests = patch.guests !== undefined;
  if (!hasStatus && !hasGuests) throw new ApiError(400, 'validation', 'Вкажіть, що змінити: status або guests');
  if (hasStatus && patch.status !== 'cancelled') throw new ApiError(400, 'validation', 'Дозволений лише статус cancelled', { status: 'Дозволений лише cancelled' });

  if (hasGuests) {
    if (row.status !== 'confirmed') throw new ApiError(409, 'not_active', 'Скасоване бронювання змінити не можна');
    const errors = {};
    const guests = validateGuests(patch.guests, db.prepare('SELECT * FROM games WHERE id = ?').get(row.game_id),
      db.prepare('SELECT * FROM tables WHERE id = ?').get(row.table_id), errors);
    if (errors.guests) throw new ApiError(400, 'validation', 'Перевірте введені дані', errors);
    db.prepare('UPDATE bookings SET guests = ? WHERE id = ?').run(guests, id);
  }
  if (hasStatus && row.status !== 'cancelled') {
    const today = kyivNow(now);
    const left = row.date > today.date ? Infinity : row.date < today.date ? -1 : slotMinutes(row.time) - today.minutes;
    if (left < MIN_CANCEL_MINUTES) throw new ApiError(409, 'too_late', 'Бронювання скасовують не пізніше ніж за 2 години до початку.');
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);
  }
  return dto(findOwned(db, owner, id));
}

function deleteBooking(db, owner, id) {
  const row = findOwned(db, owner, id);
  // Активну бронь спочатку скасовують (з перевіркою 2 годин), інакше це правило можна обійти через DELETE
  if (row.status !== 'cancelled') throw new ApiError(409, 'not_cancelled', 'Спочатку скасуйте бронювання, потім його можна видалити.');
  db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
}

// ----- Довідники -----
const listGames = (db) => db.prepare('SELECT * FROM games ORDER BY name').all().map((g) => ({
  id: g.id, name: g.name, minPlayers: g.min_players, maxPlayers: g.max_players, duration: g.duration, difficulty: g.difficulty
}));
function getGame(db, id) {
  const g = listGames(db).find((x) => x.id === id);
  if (!g) throw new ApiError(404, 'not_found', 'Гру не знайдено');
  return g;
}
function availability(db, date, time) {
  const errors = {};
  if (!isDate(String(date || ''))) errors.date = 'Вкажіть дату у форматі РРРР-ММ-ДД';
  if (!TIMES.includes(time)) errors.time = 'Оберіть час зі списку';
  if (Object.keys(errors).length) throw new ApiError(400, 'validation', 'Перевірте параметри запиту', errors);
  return db.prepare("SELECT table_id FROM bookings WHERE date = ? AND time = ? AND status = 'confirmed'")
    .all(date, time).map((r) => Number(r.table_id));
}

module.exports = { ApiError, UUID, createBooking, listBookings, updateBooking, deleteBooking, listGames, getGame, availability };
