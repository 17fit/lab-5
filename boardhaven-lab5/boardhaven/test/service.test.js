'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../db');
const svc = require('../service');

const NOW = new Date('2026-11-12T10:00:00Z'); // 12:00 у Києві
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const valid = { game: 'catan', date: '2026-11-14', time: '18:00', table: 3, guests: 3, name: 'Олена', phone: '+380 50 123 45 67' };
const fail = (fn, status, code) => assert.throws(fn, (e) => e instanceof svc.ApiError && e.status === status && (!code || e.code === code));

test('створення бронювання: нормалізує дані та повертає підтверджений запис', () => {
  const db = openDb(':memory:');
  const b = svc.createBooking(db, A, valid, NOW);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.game, 'Catan');
  assert.equal(b.table, 3);
  assert.equal(svc.listBookings(db, A).length, 1);
});

test('валідація: некоректні поля дають 400 з повідомленнями', () => {
  const db = openDb(':memory:');
  const bad = { game: 'x', date: '2020-01-01', time: '13:00', table: 99, guests: 'a', name: 'A1', phone: '123' };
  assert.throws(() => svc.createBooking(db, A, bad, NOW), (e) => e.status === 400 &&
    ['game', 'date', 'time', 'table', 'name', 'phone'].every((k) => e.errors[k]));
});

test('кількість гравців обмежена межами гри та місткістю столу', () => {
  const db = openDb(':memory:');
  fail(() => svc.createBooking(db, A, { ...valid, guests: 5 }, NOW), 400, 'validation');
  fail(() => svc.createBooking(db, A, { ...valid, table: 1 }, NOW), 400, 'validation'); // стіл 1: до 2 осіб
});

test('дата не раніше за сьогодні й не далі ніж на 14 днів; минулий час сьогодні відхиляється', () => {
  const db = openDb(':memory:');
  fail(() => svc.createBooking(db, A, { ...valid, date: '2026-11-11' }, NOW), 400);
  fail(() => svc.createBooking(db, A, { ...valid, date: '2026-12-31' }, NOW), 400);
  fail(() => svc.createBooking(db, A, { ...valid, date: '2026-11-12', time: '14:00' }, new Date('2026-11-12T13:00:00Z')), 400);
  assert.ok(svc.createBooking(db, A, { ...valid, date: '2026-11-12', time: '14:00' }, NOW));
});

test('подвійне бронювання столу дає 409, скасування звільняє стіл', () => {
  const db = openDb(':memory:');
  const b = svc.createBooking(db, A, valid, NOW);
  fail(() => svc.createBooking(db, B, valid, NOW), 409, 'table_busy');
  assert.deepEqual(svc.availability(db, '2026-11-14', '18:00'), [3]);
  svc.updateBooking(db, A, b.id, { status: 'cancelled' }, NOW);
  assert.deepEqual(svc.availability(db, '2026-11-14', '18:00'), []);
  assert.ok(svc.createBooking(db, B, valid, NOW));
});

test('користувач бачить і змінює лише власні бронювання', () => {
  const db = openDb(':memory:');
  const b = svc.createBooking(db, A, valid, NOW);
  assert.equal(svc.listBookings(db, B).length, 0);
  fail(() => svc.updateBooking(db, B, b.id, { status: 'cancelled' }, NOW), 404);
  fail(() => svc.deleteBooking(db, B, b.id), 404);
});

test('скасування менш ніж за 2 години до початку заборонене', () => {
  const db = openDb(':memory:');
  const b = svc.createBooking(db, A, { ...valid, date: '2026-11-12', time: '16:00' }, NOW);
  fail(() => svc.updateBooking(db, A, b.id, { status: 'cancelled' }, new Date('2026-11-12T13:00:00Z')), 409, 'too_late'); // 15:00 у Києві
  assert.equal(svc.updateBooking(db, A, b.id, { status: 'cancelled' }, NOW).status, 'cancelled'); // 12:00 — ще можна
});

test('оновлення кількості гравців і видалення', () => {
  const db = openDb(':memory:');
  const b = svc.createBooking(db, A, valid, NOW);
  assert.equal(svc.updateBooking(db, A, b.id, { guests: 4 }, NOW).guests, 4);
  fail(() => svc.updateBooking(db, A, b.id, { guests: 9 }, NOW), 400);
  fail(() => svc.updateBooking(db, A, b.id, {}, NOW), 400);
  fail(() => svc.deleteBooking(db, A, b.id), 409, 'not_cancelled'); // активну бронь видалити не можна
  svc.updateBooking(db, A, b.id, { status: 'cancelled' }, NOW);
  svc.deleteBooking(db, A, b.id);
  assert.equal(svc.listBookings(db, A).length, 0);
});

test('SQL-ін’єкція в полі гри не ламає запит', () => {
  const db = openDb(':memory:');
  fail(() => svc.createBooking(db, A, { ...valid, game: "catan' OR '1'='1" }, NOW), 400);
  assert.equal(svc.listGames(db).length, 6);
});
