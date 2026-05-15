/** Indian mobile: 10 digits, first digit 6–9. */

const MOBILE_RE = /^[6-9]\d{9}$/

export function indianMobileDigitsOnly(input: string): string {
  return String(input ?? '').replace(/\D/g, '').slice(0, 10)
}

export function isValidIndianMobile(digits: string): boolean {
  return MOBILE_RE.test(digits)
}

/** Display "98765 43210" from 10-digit string (or partial). */
export function formatIndianMobileDisplay(digits: string): string {
  const d = indianMobileDigitsOnly(digits)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)} ${d.slice(5)}`
}

/** Normalize API/stored value to 10-digit national or "". */
export function parseStoredIndianMobile(raw: string | null | undefined): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const d = s.replace(/\D/g, '')
  if (d.length === 10 && MOBILE_RE.test(d)) return d
  if (d.length === 11 && d.startsWith('0') && MOBILE_RE.test(d.slice(1))) return d.slice(1)
  if (d.length === 12 && d.startsWith('91') && MOBILE_RE.test(d.slice(2))) return d.slice(2)
  return ''
}
