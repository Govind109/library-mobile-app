export type AttendanceMode = 'button_only' | 'qr_only' | 'both';

/** Normalize library attendance_mode from API for UI and punch rules. */
export function normalizeAttendanceMode(mode: string | null | undefined): AttendanceMode {
  if (mode === 'button_only' || mode === 'qr_only' || mode === 'both') {
    return mode;
  }
  return 'both';
}

export function attendanceModeLabel(mode: AttendanceMode): string {
  if (mode === 'button_only') return 'Button check-in/check-out only';
  if (mode === 'qr_only') return 'QR scan only';
  return 'Button + QR check-in';
}

export function attendanceModeShortLabel(mode: AttendanceMode): string {
  if (mode === 'button_only') return 'Button';
  if (mode === 'qr_only') return 'QR scan';
  return 'Button + QR';
}

export function attendanceModeAllowsButton(mode: AttendanceMode): boolean {
  return mode === 'button_only' || mode === 'both';
}

export function attendanceModeAllowsQr(mode: AttendanceMode): boolean {
  return mode === 'qr_only' || mode === 'both';
}
