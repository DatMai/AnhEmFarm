-- Account idempotency is enforced by order_placement_keys(userId, key).
-- A guest can reuse the same key in a separate session; claiming both orders
-- must not fail on the historical orders(userId, idempotencyKey) constraint.
DROP INDEX "orders_userId_idempotencyKey_key";
