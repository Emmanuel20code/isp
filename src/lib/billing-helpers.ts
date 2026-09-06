const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateVoucherCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Normalises Kenyan numbers to 2547XXXXXXXX / 2541XXXXXXXX format. */
export function normalizeKePhone(input: string): string {
  let digits = (input || "").replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = `254${digits.slice(1)}`;
  } else if (
    !digits.startsWith("254") &&
    digits.length === 9 &&
    (digits.startsWith("7") || digits.startsWith("1"))
  ) {
    digits = `254${digits}`;
  }
  return digits;
}

/** Validates that phone number is a valid 12-digit Kenyan phone number starting with 2547 or 2541 */
export function isValidKePhone(phone: string): boolean {
  return /^254[17]\d{8}$/.test(phone);
}

/** Formats package duration in hours, minutes, or days */
export function formatPackageDuration(hours: number): string {
  if (!hours || hours <= 0) return "0 mins";
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} min${mins === 1 ? "" : "s"}`;
  }
  if (hours % 720 === 0 && hours >= 720) {
    const months = hours / 720;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remHours = Math.round((hours % 24) * 10) / 10;
    if (remHours === 0) return `${days} day${days === 1 ? "" : "s"}`;
    return `${days}d ${remHours}h`;
  }
  if (!Number.isInteger(hours)) {
    const wholeHours = Math.floor(hours);
    const mins = Math.round((hours - wholeHours) * 60);
    if (wholeHours === 0) return `${mins} mins`;
    if (mins === 0) return `${wholeHours} hr${wholeHours === 1 ? "" : "s"}`;
    return `${wholeHours}h ${mins}m`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
