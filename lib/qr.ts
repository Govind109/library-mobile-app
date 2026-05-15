export function qrImageUrl(payload?: string | null, size = 260) {
  const safeSize = Math.max(120, Math.min(600, Number(size) || 260));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${safeSize}x${safeSize}&margin=12&data=${encodeURIComponent(payload || '')}`;
}
