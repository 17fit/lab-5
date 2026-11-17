# BoardHaven — вебзастосунок клубу настільних ігор

Лабораторна робота № 5. Клієнт (HTML/CSS/JS, `public/`) + сервер Node.js/Express + база даних SQLite + REST API.

## Запуск
```
npm install
npm test        # модульні тести бізнес-логіки (node:test)
npm start       # http://localhost:3000
```
Потрібен Node.js 22.13 або новіший (використовується вбудований модуль `node:sqlite`).
Налаштування — у змінних середовища (див. `.env.example`): `PORT`, `DB_FILE`.

## REST API
Усі відповіді — JSON. Для `/api/bookings*` потрібен заголовок `X-Client-Id` (UUID клієнта).

| Метод | Маршрут | Опис | Коди |
| --- | --- | --- | --- |
| GET | /api/health | Перевірка роботи | 200 |
| GET | /api/games, /api/games/:id | Каталог ігор | 200, 404 |
| GET | /api/availability?date=РРРР-ММ-ДД&time=ГГ:ХХ | Зайняті столи на вказаний час | 200, 400 |
| GET | /api/bookings | Бронювання клієнта | 200, 401 |
| POST | /api/bookings | Створити бронювання | 201, 400, 401, 409 |
| PATCH | /api/bookings/:id | Скасувати (`status: "cancelled"`) або змінити `guests` | 200, 400, 404, 409 |
| DELETE | /api/bookings/:id | Видалити скасоване бронювання | 204, 404, 409 |

Приклад:
```
curl -X POST http://localhost:3000/api/bookings -H "Content-Type: application/json" \
  -H "X-Client-Id: 11111111-1111-4111-8111-111111111111" \
  -d '{"game":"catan","date":"2026-11-20","time":"18:00","table":3,"guests":3,"name":"Олена","phone":"+380501234567"}'
```

## Розгортання (Render)
Web Service із репозиторію GitHub: Build Command `npm install`, Start Command `npm start`, змінна `NODE_VERSION=22`.
Файл бази на безкоштовному тарифі не зберігається між перезапусками — для постійних даних підключіть диск (`DB_FILE=/var/data/boardhaven.db`).
