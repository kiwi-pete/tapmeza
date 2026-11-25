/** Shapes shared by the Admin Portal menu pages, their server actions and their client components. */

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface AdminZone {
  id: string;
  name: string;
}

export interface AdminMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceMinor: number;
  available: boolean;
  zoneIds: string[];
}

export interface AdminMenuCategory {
  id: string;
  name: string;
  items: AdminMenuItem[];
}
