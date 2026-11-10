-- Скидки из внешнего API (discountPercent, amountPaid).
-- NULL в amount_paid_kop — версия заказа сохранена до того, как сервис начал учитывать скидки:
-- такую строку следующий синк перезапишет даже при том же updatedAt (см. OrdersRepository.upsertIfNewer).
ALTER TABLE orders
  ADD COLUMN discount_percent NUMERIC(5, 2) CHECK (discount_percent BETWEEN 0 AND 100),
  ADD COLUMN amount_paid_kop  BIGINT        CHECK (amount_paid_kop >= 0);
