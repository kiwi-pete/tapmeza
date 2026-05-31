-- =========================================================================
-- SEED DATA FOR TAPMEZA LOCAL DEVELOPMENT
-- =========================================================================

-- 1. Insert Demo Venue ("Tapmeza Beach Club", TZS, Africa/Dar_es_Salaam timezone)
INSERT INTO venues (id, slug, name, currency, timezone, active)
VALUES (
  'a3b93478-f7b5-4b08-9df2-aef7318db402',
  'tapmeza-beach-club',
  'Tapmeza Beach Club',
  'TZS',
  'Africa/Dar_es_Salaam',
  true
);

-- 2. Insert Zones (Restaurant, Pool)
-- Restaurant Zone
INSERT INTO zones (id, venue_id, name, sort)
VALUES (
  '120df055-6b5f-4d37-8efd-bb7f385c2c58',
  'a3b93478-f7b5-4b08-9df2-aef7318db402',
  'Restaurant',
  0
);

-- Pool Zone
INSERT INTO zones (id, venue_id, name, sort)
VALUES (
  '230df055-6b5f-4d37-8efd-bb7f385c2c58',
  'a3b93478-f7b5-4b08-9df2-aef7318db402',
  'Pool',
  1
);

-- 3. Insert Locations (3 Tables in Restaurant, 2 Loungers at Pool)
-- Restaurant Tables
INSERT INTO locations (id, venue_id, zone_id, label, active)
VALUES 
  ('340df055-6b5f-4d37-8efd-bb7f385c2c58', 'a3b93478-f7b5-4b08-9df2-aef7318db402', '120df055-6b5f-4d37-8efd-bb7f385c2c58', 'Table 1', true),
  ('450df055-6b5f-4d37-8efd-bb7f385c2c58', 'a3b93478-f7b5-4b08-9df2-aef7318db402', '120df055-6b5f-4d37-8efd-bb7f385c2c58', 'Table 2', true),
  ('560df055-6b5f-4d37-8efd-bb7f385c2c58', 'a3b93478-f7b5-4b08-9df2-aef7318db402', '120df055-6b5f-4d37-8efd-bb7f385c2c58', 'Table 3', true);

-- Pool Loungers
INSERT INTO locations (id, venue_id, zone_id, label, active)
VALUES 
  ('670df055-6b5f-4d37-8efd-bb7f385c2c58', 'a3b93478-f7b5-4b08-9df2-aef7318db402', '230df055-6b5f-4d37-8efd-bb7f385c2c58', 'Lounge 1', true),
  ('780df055-6b5f-4d37-8efd-bb7f385c2c58', 'a3b93478-f7b5-4b08-9df2-aef7318db402', '230df055-6b5f-4d37-8efd-bb7f385c2c58', 'Lounge 2', true);

-- 4. Insert Menu Categories (Starters, Mains, Drinks)
INSERT INTO menu_categories (id, venue_id, name, sort)
VALUES 
  ('890df055-6b5f-4d37-8efd-bb7f385c2c58', 'a3b93478-f7b5-4b08-9df2-aef7318db402', 'Starters', 0),
  ('9a0df055-6b5f-4d37-8efd-bb7f385c2c58', 'a3b93478-f7b5-4b08-9df2-aef7318db402', 'Mains', 1),
  ('ab0df055-6b5f-4d37-8efd-bb7f385c2c58', 'a3b93478-f7b5-4b08-9df2-aef7318db402', 'Drinks', 2);

-- 5. Insert Menu Items (prices in senti minor units: 1 TZS = 100 senti)
-- Starters: Samosas (12,500 TZS -> 1,250,000 senti) - Shared
INSERT INTO menu_items (id, venue_id, category_id, name, description, price_minor, available)
VALUES (
  'bc0df055-6b5f-4d37-8efd-bb7f385c2c58',
  'a3b93478-f7b5-4b08-9df2-aef7318db402',
  '890df055-6b5f-4d37-8efd-bb7f385c2c58',
  'Zanzibar Samosas',
  'Three crispy pastry pockets filled with spiced local beef or vegetables, served with lime.',
  1250000,
  true
);

-- Mains: Catch of the Day (28,000 TZS -> 2,800,000 senti) - Restaurant-Only
INSERT INTO menu_items (id, venue_id, category_id, name, description, price_minor, available)
VALUES (
  'cd0df055-6b5f-4d37-8efd-bb7f385c2c58',
  'a3b93478-f7b5-4b08-9df2-aef7318db402',
  '9a0df055-6b5f-4d37-8efd-bb7f385c2c58',
  'Grilled Catch of the Day',
  'Freshly caught local reef fish grilled with Swahili spices, served with coconut rice and kachumbari.',
  2800000,
  true
);

-- Mains: Club Sandwich (18,500 TZS -> 1,850,000 senti) - Pool-Only
INSERT INTO menu_items (id, venue_id, category_id, name, description, price_minor, available)
VALUES (
  'de0df055-6b5f-4d37-8efd-bb7f385c2c58',
  'a3b93478-f7b5-4b08-9df2-aef7318db402',
  '9a0df055-6b5f-4d37-8efd-bb7f385c2c58',
  'Beachfront Club Sandwich',
  'Toasted bread with grilled chicken, bacon, lettuce, tomato, and avocado. Served with hand-cut fries.',
  1850000,
  true
);

-- Drinks: Fresh Coconut (8,000 TZS -> 800,000 senti) - Shared
INSERT INTO menu_items (id, venue_id, category_id, name, description, price_minor, available)
VALUES (
  'ef0df055-6b5f-4d37-8efd-bb7f385c2c58',
  'a3b93478-f7b5-4b08-9df2-aef7318db402',
  'ab0df055-6b5f-4d37-8efd-bb7f385c2c58',
  'Madafu (Fresh Coconut)',
  'Chilled local coconut opened fresh to order.',
  800000,
  true
);

-- Mains: Lunch Daypart Buffet (35,000 TZS -> 3,500,000 senti) - Spans 11:00 to 15:00
INSERT INTO menu_items (id, venue_id, category_id, name, description, price_minor, available, available_from, available_until)
VALUES (
  'f00df055-6b5f-4d37-8efd-bb7f385c2c58',
  'a3b93478-f7b5-4b08-9df2-aef7318db402',
  '9a0df055-6b5f-4d37-8efd-bb7f385c2c58',
  'Spice Island Lunch Buffet',
  'A selection of local Swahili curries, grilled seafood, and traditional spices. Available only for lunch.',
  3500000,
  true,
  '11:00:00',
  '15:00:00'
);

-- 6. Map Menu Items to Zones (menu_item_zones)
-- Zanzibar Samosas: Restaurant and Pool
INSERT INTO menu_item_zones (menu_item_id, zone_id)
VALUES 
  ('bc0df055-6b5f-4d37-8efd-bb7f385c2c58', '120df055-6b5f-4d37-8efd-bb7f385c2c58'),
  ('bc0df055-6b5f-4d37-8efd-bb7f385c2c58', '230df055-6b5f-4d37-8efd-bb7f385c2c58');

-- Grilled Catch of the Day: Restaurant Only
INSERT INTO menu_item_zones (menu_item_id, zone_id)
VALUES 
  ('cd0df055-6b5f-4d37-8efd-bb7f385c2c58', '120df055-6b5f-4d37-8efd-bb7f385c2c58');

-- Beachfront Club Sandwich: Pool Only
INSERT INTO menu_item_zones (menu_item_id, zone_id)
VALUES 
  ('de0df055-6b5f-4d37-8efd-bb7f385c2c58', '230df055-6b5f-4d37-8efd-bb7f385c2c58');

-- Madafu (Fresh Coconut): Restaurant and Pool
INSERT INTO menu_item_zones (menu_item_id, zone_id)
VALUES 
  ('ef0df055-6b5f-4d37-8efd-bb7f385c2c58', '120df055-6b5f-4d37-8efd-bb7f385c2c58'),
  ('ef0df055-6b5f-4d37-8efd-bb7f385c2c58', '230df055-6b5f-4d37-8efd-bb7f385c2c58');

-- Spice Island Lunch Buffet: Restaurant and Pool
INSERT INTO menu_item_zones (menu_item_id, zone_id)
VALUES 
  ('f00df055-6b5f-4d37-8efd-bb7f385c2c58', '120df055-6b5f-4d37-8efd-bb7f385c2c58'),
  ('f00df055-6b5f-4d37-8efd-bb7f385c2c58', '230df055-6b5f-4d37-8efd-bb7f385c2c58');
