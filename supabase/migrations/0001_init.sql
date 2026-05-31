-- Enable necessary PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =========================================================================
-- TABLES DEFINITION
-- =========================================================================

-- Venues (tenants)
CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug citext UNIQUE NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'TZS',
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Venue Members (gating Staff App & Admin Portal access)
CREATE TABLE venue_members (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, venue_id)
);

-- Zones (e.g. Restaurant, Pool, Rooms)
CREATE TABLE zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Locations (specific tables, lounge chairs, hotel rooms)
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  label text NOT NULL,
  qr_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Menu Categories
CREATE TABLE menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Menu Items
CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_minor int NOT NULL CHECK (price_minor >= 0),
  image_url text,
  available boolean NOT NULL DEFAULT true,
  available_from time,
  available_until time,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Join table: Menu Item Availability per Zone
CREATE TABLE menu_item_zones (
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id, zone_id)
);

-- Orders
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'preparing', 'ready', 'delivered', 'cancelled')),
  currency text NOT NULL,
  total_minor int NOT NULL CHECK (total_minor >= 0),
  guest_note text,
  settlement text NOT NULL DEFAULT 'pay_at_venue' CHECK (settlement IN ('pay_at_venue', 'charge_to_room')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Order Items (Snapshots name and price at order time)
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  unit_price_minor_snapshot int NOT NULL CHECK (unit_price_minor_snapshot >= 0),
  qty int NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Order Events (Append-only lifecycle log)
CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================================
-- INDEXES DEFINITION
-- =========================================================================
CREATE INDEX idx_venue_members_user ON venue_members(user_id);
CREATE INDEX idx_venue_members_venue ON venue_members(venue_id);
CREATE INDEX idx_zones_venue ON zones(venue_id);
CREATE INDEX idx_locations_venue ON locations(venue_id);
CREATE INDEX idx_locations_qr_token ON locations(qr_token);
CREATE INDEX idx_menu_categories_venue ON menu_categories(venue_id);
CREATE INDEX idx_menu_items_venue ON menu_items(venue_id);
CREATE INDEX idx_menu_item_zones_item ON menu_item_zones(menu_item_id);
CREATE INDEX idx_orders_venue ON orders(venue_id);
CREATE INDEX idx_orders_location ON orders(location_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_events_order ON order_events(order_id);

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS on every table
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

-- 1. Venues
CREATE POLICY "Venue members can read venues they belong to" ON venues
  FOR SELECT TO authenticated
  USING (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = venues.id));

CREATE POLICY "Venue owners can modify venues they belong to" ON venues
  FOR ALL TO authenticated
  USING (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = venues.id and vm.role = 'owner'));

-- 2. Venue Members
CREATE POLICY "Venue members can read membership details" ON venue_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = venue_members.venue_id and vm.role = 'owner'));

CREATE POLICY "Venue owners can manage membership details" ON venue_members
  FOR ALL TO authenticated
  USING (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = venue_members.venue_id and vm.role = 'owner'));

-- 3. Zones
CREATE POLICY "Venue members can manage zones" ON zones
  FOR ALL TO authenticated
  USING (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = zones.venue_id))
  WITH CHECK (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = zones.venue_id));

-- 4. Locations
CREATE POLICY "Venue members can manage locations" ON locations
  FOR ALL TO authenticated
  USING (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = locations.venue_id))
  WITH CHECK (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = locations.venue_id));

-- 5. Menu Categories
CREATE POLICY "Venue members can manage menu categories" ON menu_categories
  FOR ALL TO authenticated
  USING (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = menu_categories.venue_id))
  WITH CHECK (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = menu_categories.venue_id));

-- 6. Menu Items
CREATE POLICY "Venue members can manage menu items" ON menu_items
  FOR ALL TO authenticated
  USING (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = menu_items.venue_id))
  WITH CHECK (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = menu_items.venue_id));

-- 7. Menu Item Zones
CREATE POLICY "Venue members can manage menu item zones mapping" ON menu_item_zones
  FOR ALL TO authenticated
  USING (
    exists (
      SELECT 1 FROM menu_items mi
      JOIN venue_members vm ON vm.venue_id = mi.venue_id
      WHERE vm.user_id = auth.uid() AND mi.id = menu_item_zones.menu_item_id
    )
  )
  WITH CHECK (
    exists (
      SELECT 1 FROM menu_items mi
      JOIN venue_members vm ON vm.venue_id = mi.venue_id
      WHERE vm.user_id = auth.uid() AND mi.id = menu_item_zones.menu_item_id
    )
  );

-- 8. Orders
CREATE POLICY "Venue members can manage orders" ON orders
  FOR ALL TO authenticated
  USING (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = orders.venue_id))
  WITH CHECK (exists (SELECT 1 FROM venue_members vm WHERE vm.user_id = auth.uid() and vm.venue_id = orders.venue_id));

-- 9. Order Items
CREATE POLICY "Venue members can read/write order items" ON order_items
  FOR ALL TO authenticated
  USING (
    exists (
      SELECT 1 FROM orders o
      JOIN venue_members vm ON vm.venue_id = o.venue_id
      WHERE vm.user_id = auth.uid() AND o.id = order_items.order_id
    )
  )
  WITH CHECK (
    exists (
      SELECT 1 FROM orders o
      JOIN venue_members vm ON vm.venue_id = o.venue_id
      WHERE vm.user_id = auth.uid() AND o.id = order_items.order_id
    )
  );

-- 10. Order Events (Strictly Append-only RLS policies)
CREATE POLICY "Venue members can view order events" ON order_events
  FOR SELECT TO authenticated
  USING (
    exists (
      SELECT 1 FROM orders o
      JOIN venue_members vm ON vm.venue_id = o.venue_id
      WHERE vm.user_id = auth.uid() AND o.id = order_events.order_id
    )
  );

CREATE POLICY "Venue members can append order events" ON order_events
  FOR INSERT TO authenticated
  WITH CHECK (
    exists (
      SELECT 1 FROM orders o
      JOIN venue_members vm ON vm.venue_id = o.venue_id
      WHERE vm.user_id = auth.uid() AND o.id = order_events.order_id
    )
  );

-- Revoke all update/delete permissions from non-superusers on order_events
REVOKE UPDATE, DELETE ON order_events FROM anon, authenticated;

-- =========================================================================
-- TRIGGERS AND AUTOMATION
-- =========================================================================

-- Trigger to automatically log the initial 'received' status on order creation
CREATE OR REPLACE FUNCTION on_order_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO order_events (order_id, status, actor, at)
  VALUES (NEW.id, NEW.status, NULL, COALESCE(NEW.created_at, now()));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_order_created
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION on_order_created();

-- Trigger to automatically log any order status updates into order_events
CREATE OR REPLACE FUNCTION on_order_status_updated()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_events (order_id, status, actor, at)
    VALUES (NEW.id, NEW.status, auth.uid(), now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_order_status_updated
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION on_order_status_updated();
