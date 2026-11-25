-- Keep items in the order of the printed menu within each category.
-- Existing rows default to 0, so they keep sorting by name until reordered.
ALTER TABLE menu_items ADD COLUMN sort int NOT NULL DEFAULT 0;

-- order_items.menu_item_id was NOT NULL with ON DELETE SET NULL, so a menu item
-- could never be deleted once it had been ordered. Order history is carried by
-- name_snapshot / unit_price_minor_snapshot, so the link may be cleared.
ALTER TABLE order_items ALTER COLUMN menu_item_id DROP NOT NULL;
