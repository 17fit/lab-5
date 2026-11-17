'use strict';
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const svc = require('./service');

function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // за проксі хмарної платформи (Render) беремо реальну IP-адресу клієнта

  // Захисні заголовки
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'"
    });
    next();
  });

  // Обмеження частоти змінюючих запитів: 60 на хвилину з однієї адреси
  const hits = new Map();
  setInterval(() => hits.clear(), 60 * 1000).unref();
  const limitWrites = (req, res, next) => {
    if (req.method === 'GET') return next();
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    return n > 60 ? next(new svc.ApiError(429, 'rate_limit', 'Забагато запитів. Спробуйте за хвилину.')) : next();
  };

  // Ідентифікатор клієнта: кожен користувач бачить лише власні бронювання
  const owner = (req, res, next) => {
    const id = req.get('X-Client-Id') || '';
    if (!svc.UUID.test(id)) return next(new svc.ApiError(401, 'no_client', 'Потрібен заголовок X-Client-Id'));
    req.owner = id.toLowerCase();
    return next();
  };
  const idOf = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : NaN);

  app.use('/api', express.json({ limit: '10kb' }), limitWrites);

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/api/games', (req, res) => res.json({ games: svc.listGames(db) }));
  app.get('/api/games/:id', (req, res) => res.json(svc.getGame(db, req.params.id)));
  app.get('/api/availability', (req, res) => res.json({ busy: svc.availability(db, req.query.date, req.query.time) }));

  app.get('/api/bookings', owner, (req, res) => res.json({ bookings: svc.listBookings(db, req.owner) }));
  app.post('/api/bookings', owner, (req, res) => res.status(201).json(svc.createBooking(db, req.owner, req.body || {})));
  app.patch('/api/bookings/:id', owner, (req, res) => res.json(svc.updateBooking(db, req.owner, idOf(req), req.body || {})));
  app.delete('/api/bookings/:id', owner, (req, res) => { svc.deleteBooking(db, req.owner, idOf(req)); res.status(204).end(); });

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Маршрут не знайдено' }));
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof svc.ApiError) return res.status(err.status).json({ error: err.code, message: err.message, errors: err.errors });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Некоректний JSON у запиті' });
    console.error(err);
    return res.status(500).json({ error: 'server', message: 'Внутрішня помилка сервера' });
  });
  return app;
}

if (require.main === module) {
  const db = openDb(process.env.DB_FILE || path.join(__dirname, 'data', 'boardhaven.db'));
  const port = process.env.PORT || 3000;
  createApp(db).listen(port, () => console.log(`BoardHaven: http://localhost:${port}`));
}

module.exports = { createApp };
