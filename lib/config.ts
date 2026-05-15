import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Base URL including `/api` suffix, no trailing slash. */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  const fromExtra = extra?.apiBaseUrl?.trim();
  if (fromExtra) return fromExtra.replace(/\/$/, '');

  if (__DEV__) {
    return 'http://192.168.31.239:8000/api';
  }

  return 'https://example.invalid/api';
}

/** Laravel app origin (without `/api`). */
export function apiOrigin(): string {
  return getApiBaseUrl().replace(/\/api\/?$/i, '');
}

/** Resolve relative storage/media paths into absolute URLs for images. */
export function resolveMediaUrl(url?: string | null): string | null {
  if (url == null || url === '') return null;
  const raw = String(url).trim();
  const origin = apiOrigin();

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.pathname.startsWith('/storage/')) {
        const rel = u.pathname.replace(/^\/storage\//, '');
        return `${origin}/media/${rel}${u.search}${u.hash}`;
      }
      if (u.pathname.includes('/storage/')) {
        return `${origin}${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }

  const noLead = raw.replace(/^\/+/, '');
  if (noLead.startsWith('media/')) return `${origin}/${noLead}`;
  if (noLead.startsWith('storage/')) {
    return `${origin}/media/${noLead.replace(/^storage\//, '')}`;
  }

  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path.startsWith('/media/')) return `${origin}${path}`;
  if (path.startsWith('/storage/')) {
    return `${origin}/media/${path.replace(/^\/storage\//, '')}`;
  }

  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(noLead) && !noLead.includes('..')) {
    return `${origin}/media/${noLead}`;
  }

  if (raw.startsWith('/') && !raw.includes('..')) return `${origin}${raw}`;
  return null;
}

/** Build multiple URL candidates for resilient media loading. */
export function resolveMediaCandidates(url?: string | null): string[] {
  if (url == null || url === '') return [];
  const raw = String(url).trim();
  const origin = apiOrigin();
  const out: string[] = [];
  const add = (value?: string | null) => {
    if (!value) return;
    if (!out.includes(value)) out.push(value);
  };

  add(resolveMediaUrl(raw));

  if (/^https?:\/\//i.test(raw)) {
    add(raw);
    try {
      const u = new URL(raw);
      const noLeadPath = u.pathname.replace(/^\/+/, '');
      add(`${origin}${u.pathname}${u.search}${u.hash}`);
      if (!u.pathname.startsWith('/storage/') && noLeadPath) {
        add(`${origin}/storage/${noLeadPath}${u.search}${u.hash}`);
      }
    } catch {
      // keep best-effort candidates only
    }
    return out;
  }

  const noLead = raw.replace(/^\/+/, '');
  add(`${origin}/${noLead}`);
  add(`${origin}/storage/${noLead.replace(/^storage\//, '')}`);
  return out;
}
