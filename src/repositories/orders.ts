import type { Db } from "../db.js";

export interface Order {
  id: string;
  customerId: string;
  /** Сумма до скидки. */
  amountKop: number;
  /** Скидка, %. null — версия сохранена до учёта скидок. */
  discountPercent: number | null;
  /** Фактически оплачено. null — версия сохранена до учёта скидок. */
  amountPaidKop: number | null;
  status: "pending" | "paid" | "refunded";
  createdAt: Date;
  updatedAt: Date;
}

interface Row {
  id: string;
  customer_id: string;
  amount_kop: string;
  discount_percent: string | null;
  amount_paid_kop: string | null;
  status: Order["status"];
  created_at: Date;
  updated_at: Date;
}

const fromRow = (r: Row): Order => ({
  id: r.id,
  customerId: r.customer_id,
  amountKop: Number(r.amount_kop),
  discountPercent: r.discount_percent === null ? null : Number(r.discount_percent),
  amountPaidKop: r.amount_paid_kop === null ? null : Number(r.amount_paid_kop),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface DailySum {
  date: string;
  grossKop: number;
  netKop: number;
}

export class OrdersRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<Order | null> {
    const { rows } = await this.db.query<Row>(`SELECT * FROM orders WHERE id = $1`, [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  }

  /**
   * Сохраняет версию заказа, только если она новее сохранённой (по updated_at) — одним атомарным запросом,
   * чтобы параллельные вебхуки/синк по одному заказу не затирали свежую версию устаревшей.
   * Исключение: строка, сохранённая до учёта скидок (amount_paid_kop IS NULL), перезаписывается и той же версией.
   */
  async upsertIfNewer(o: Order): Promise<"created" | "updated" | "stale"> {
    const { rows } = await this.db.query<{ inserted: boolean }>(
      `INSERT INTO orders (id, customer_id, amount_kop, discount_percent, amount_paid_kop, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         customer_id      = excluded.customer_id,
         amount_kop       = excluded.amount_kop,
         discount_percent = excluded.discount_percent,
         amount_paid_kop  = excluded.amount_paid_kop,
         status           = excluded.status,
         created_at       = excluded.created_at,
         updated_at       = excluded.updated_at
       WHERE orders.updated_at < excluded.updated_at
          OR (orders.updated_at = excluded.updated_at AND orders.amount_paid_kop IS NULL AND excluded.amount_paid_kop IS NOT NULL)
       RETURNING (xmax = 0) AS inserted`,
      [o.id, o.customerId, o.amountKop, o.discountPercent, o.amountPaidKop, o.status, o.createdAt, o.updatedAt],
    );
    if (rows.length === 0) return "stale";
    return rows[0].inserted ? "created" : "updated";
  }

  /**
   * Суммы оплаченных заказов клиента по календарным дням в таймзоне `timeZone`, from..to включительно.
   * День заказа определяется по смещению таймзоны в момент создания заказа (с учётом перехода на летнее время).
   * Дни без оплат не возвращаются.
   */
  async paidDailySums(customerId: string, timeZone: string, from: string, to: string): Promise<DailySum[]> {
    const { rows } = await this.db.query<{ date: string; gross_kop: string; net_kop: string }>(
      `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD')      AS date,
              sum(amount_kop)                                       AS gross_kop,
              sum(coalesce(amount_paid_kop, amount_kop))            AS net_kop
         FROM orders
        WHERE customer_id = $1
          AND status = 'paid'
          AND created_at >= ($3::date)::timestamp AT TIME ZONE $2
          AND created_at <  ($4::date + 1)::timestamp AT TIME ZONE $2
        GROUP BY 1`,
      [customerId, timeZone, from, to],
    );
    return rows.map((r) => ({ date: r.date, grossKop: Number(r.gross_kop), netKop: Number(r.net_kop) }));
  }
}
