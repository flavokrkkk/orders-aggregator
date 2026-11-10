# orders-aggregator

Сервис забирает заказы интернет-магазина из внешней системы (API поддерживает другая команда),
принимает их обновления через вебхуки и считает статистику по клиентам.

## Стек

Node 20+, TypeScript, Fastify, PostgreSQL (`pg`), Zod, Vitest.

## Запуск

Образ внешнего API лежит рядом с этой папкой — загрузите тот, что под вашу архитектуру (`uname -m`):

```bash
docker load -i ../orders-mock-arm64.tar.gz   # arm64 / aarch64 (Mac на Apple Silicon)
docker load -i ../orders-mock-amd64.tar.gz   # x86_64
```

```bash
cp .env.example .env        # читается сервисом и тестами автоматически; переменные окружения приоритетнее
docker compose up -d        # PostgreSQL (+ тестовая БД orders_test) и внешний API на :4000
npm install
npm run migrate
npm run dev                 # http://localhost:3000
```

Отправка вебхуков из внешней системы (для разработки запускается вручную, сервис должен быть запущен):

```bash
docker compose run --rm orders-api webhooks --target http://host.docker.internal:3000/webhooks/order
```

Тесты (нужен запущенный PostgreSQL):

```bash
npm test
```

## Структура

```
src/
  app.ts              Fastify-приложение, обработка ошибок
  container.ts        сборка зависимостей
  db.ts               пул соединений, миграции
  clients/            клиент внешнего API (лимиты, ретраи)
  repositories/       доступ к данным
  services/           бизнес-логика
  routes/             HTTP-слой
  utils/              деньги, время
migrations/           SQL-миграции, применяются по порядку
test/                 интеграционные тесты на реальной БД (внешний API — фейк)
```

## Соглашения

- Деньги внутри сервиса — в копейках (integer). Рубли — только на входе из внешнего API и в ответах.
- Время храним в UTC (`TIMESTAMPTZ`).
- Ошибки бизнес-логики — наследники `AppError`, в ответе `{ error: <код>, message }`.

## API сервиса

| Метод | Путь | Описание |
|---|---|---|
| POST | `/sync` | Забрать все заказы из внешнего API. Отвечает статистикой, когда всё забрано |
| POST | `/webhooks/order` | Обновление заказа (тело — `Order` внешнего API). Повтор/устаревшая версия → `200 { result: "stale" }` |
| GET | `/customers/:id/daily-totals?from=YYYY-MM-DD&to=YYYY-MM-DD` | Оплаченные (`paid`) заказы по дням в таймзоне клиента (день — по смещению таймзоны в момент заказа, с учётом перехода на летнее время): `[{ date, total, gross, discount, net }]`. `gross` — до скидки, `net` — фактически оплачено, `discount = gross - net`, `total = gross` (обратная совместимость). Период — не больше 366 дней |
| GET | `/health` | Проверка живости |

## Внешний API (`ORDERS_API_URL`)

- `GET /orders?cursor=<string>&limit=<1..100>` → `{ items: Order[], nextCursor: string | null }`. Лимит 5 rps.
- `GET /customers/:id` → `{ id, timezone }` (IANA, например `Europe/Berlin`).
- Вебхуки: `POST` на наш `/webhooks/order`, тело — `Order`. Повторная доставка возможна.

```ts
type Order = {
  id: string;
  customerId: string;
  amount: number;          // сумма заказа в рублях, до скидки
  discountPercent: number; // скидка, % (0 — без скидки)
  amountPaid: number;      // оплачено, в рублях: amount со скидкой
  status: "pending" | "paid" | "refunded";
  createdAt: string;       // ISO 8601, UTC
  updatedAt: string;       // ISO 8601, UTC
};
```

`discountPercent` и `amountPaid` появились в API недавно: у заказов, созданных до 2026-03-15, их нет — такие заказы считаются без скидки.
Источник правды для `net` — `amountPaid`; если его нет, а `discountPercent` есть — оплата считается по проценту.

### Обновление со старой версии

Миграция `002_discounts.sql` добавляет колонки `discount_percent` и `amount_paid_kop` (у уже сохранённых заказов — `NULL`,
в статистике для них `net = gross`). Чтобы дозаполнить скидки, после деплоя выполните `POST /sync`: строки без скидочных
данных перезаписываются и той же версией заказа.
