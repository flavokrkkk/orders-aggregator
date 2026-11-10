/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (typeof raw === "string" && raw.trim() === "")) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Процент скидки из внешнего API: число или строка с числом, 0..100. */
export function parsePercent(raw: unknown): number {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`invalid discountPercent: ${JSON.stringify(raw)}`);
  }
  return value;
}

/**
 * Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем.
 *
 * `Math.floor(rub * 100)` здесь нельзя: двоичная арифметика даёт 4723.9 * 100 = 472389.99999999994,
 * и floor теряет копейку на «круглых» суммах. Поэтому сначала округляем до 6 знаков
 * (убирает погрешность представления, не трогая реальные доли копейки), потом отбрасываем лишнее.
 */
export function toKop(rub: number): number {
  const [int, frac = ""] = rub.toFixed(6).split(".");
  const kop = Number(int) * 100 + Number(frac.slice(0, 2).padEnd(2, "0"));
  if (!Number.isSafeInteger(kop)) throw new Error(`amount out of range: ${rub}`);
  return kop;
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}
