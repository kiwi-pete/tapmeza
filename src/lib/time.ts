/**
 * Utilities for working with timezones and daypart scheduling.
 */

/**
 * Converts a SQL-style time string (e.g. "11:00", "15:00:00") into seconds from midnight.
 */
function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  const seconds = parseInt(parts[2] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Determines whether a given timestamp falls within an availability window,
 * evaluated in the venue's local timezone.
 *
 * Handles overnight schedules (e.g. from '22:00' to '02:00').
 */
export function isWithinDaypart(
  now: Date,
  from: string | null,
  until: string | null,
  timezone: string = 'Africa/Dar_es_Salaam'
): boolean {
  if (!from && !until) {
    return true;
  }

  // Get local components of the date in target timezone using Intl
  let localHour = 0;
  let localMinute = 0;
  let localSecond = 0;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    
    const hStr = parts.find(p => p.type === 'hour')?.value;
    const mStr = parts.find(p => p.type === 'minute')?.value;
    const sStr = parts.find(p => p.type === 'second')?.value;

    localHour = hStr ? parseInt(hStr, 10) : now.getHours();
    localMinute = mStr ? parseInt(mStr, 10) : now.getMinutes();
    localSecond = sStr ? parseInt(sStr, 10) : now.getSeconds();
  } catch (error) {
    // Fallback if timezone is invalid or unsupported
    localHour = now.getHours();
    localMinute = now.getMinutes();
    localSecond = now.getSeconds();
  }

  const localSeconds = localHour * 3600 + localMinute * 60 + localSecond;

  const startSeconds = from ? parseTimeToSeconds(from) : 0;
  const endSeconds = until ? parseTimeToSeconds(until) : 86399; // End of day (23:59:59)

  if (endSeconds < startSeconds) {
    // Spans across midnight (e.g., 22:00 to 02:00)
    return localSeconds >= startSeconds || localSeconds <= endSeconds;
  }

  // Standard daytime range (e.g., 11:00 to 15:00)
  return localSeconds >= startSeconds && localSeconds <= endSeconds;
}
