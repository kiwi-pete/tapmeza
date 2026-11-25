/**
 * Venue roles, as stored in venue_members.role.
 * The live database calls the venue's managing role `manager`; the original schema called it `owner`.
 * The app treats the two as the same role.
 */
export type VenueRole = 'owner' | 'manager' | 'staff';

/** May this member use the Admin Portal? */
export function canManageVenue(role: unknown): boolean {
  return role === 'owner' || role === 'manager';
}
