import type { OrdersRepository } from "../repositories/orders.js";
import { fromKop } from "../utils/money.js";
import { datesBetween } from "../utils/time.js";
import type { CustomersService } from "./customers.js";

export interface DailyTotal {
  date: string;
  /** = gross, оставлено для обратной совместимости. */
  total: number;
  /** Сумма оплаченных заказов до скидки. */
  gross: number;
  /** gross - net. */
  discount: number;
  /** Фактически оплачено клиентами. */
  net: number;
}

export class TotalsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly customers: CustomersService,
  ) {}

  /**
   * Суммы оплаченных заказов клиента по дням в его таймзоне, from..to включительно.
   * Дни без оплат — с нулями. Считается в копейках, в рубли переводится только на выходе.
   */
  async daily(customerId: string, from: string, to: string): Promise<DailyTotal[]> {
    const timezone = await this.customers.timezone(customerId);
    const sums = new Map((await this.orders.paidDailySums(customerId, timezone, from, to)).map((s) => [s.date, s]));
    return datesBetween(from, to).map((date) => {
      const grossKop = sums.get(date)?.grossKop ?? 0;
      const netKop = sums.get(date)?.netKop ?? 0;
      const gross = fromKop(grossKop);
      return { date, total: gross, gross, discount: fromKop(grossKop - netKop), net: fromKop(netKop) };
    });
  }
}
