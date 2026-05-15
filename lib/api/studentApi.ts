import { getApiBaseUrl } from '@/lib/config';
import type {
  AttendanceRow,
  HolidayRow,
  Library,
  LibraryDirectoryArea,
  LibraryDirectoryRow,
  MonthlyBillRow,
  NoticeRow,
  NoticesMeta,
  StartupAlert,
  Student,
} from '@/lib/types';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function extractMessage(status: number, body: unknown): string {
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) return o.message;
    const errors = o.errors;
    if (errors && typeof errors === 'object') {
      const first = Object.values(errors as Record<string, string[]>)[0];
      if (Array.isArray(first) && first[0]) return String(first[0]);
    }
  }
  return `Request failed (${status})`;
}

export async function studentFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null; skipAuth?: boolean } = {},
): Promise<T> {
  const { token, skipAuth, ...rest } = init;
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(rest.headers ?? {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  if (!skipAuth && token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...rest, headers });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    throw new ApiError(extractMessage(res.status, body), res.status, body);
  }

  return body as T;
}

export interface LoginResponse {
  token: string;
  student: Student;
  library: Library | null;
  alerts: StartupAlert[];
  push_token_received?: boolean;
  push_token_registered?: boolean;
  device_token?: {
    id: number;
    student_id: number;
    platform: 'android' | 'ios' | 'unknown';
    fcm_token: string;
  } | null;
}

export function studentLogin(
  loginId: string,
  password: string,
  deviceToken?: { fcm_token: string; platform: 'android' | 'ios' | 'unknown' } | null,
) {
  return studentFetch<LoginResponse>('/student/login', {
    skipAuth: true,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login_id: loginId,
      password,
      ...(deviceToken ?? {}),
    }),
  });
}

export interface MeResponse {
  student: Student;
  library: Library | null;
  alerts: StartupAlert[];
}

export function studentMe(token: string) {
  return studentFetch<MeResponse>('/student/me', { token, method: 'GET' });
}

export function studentLogout(token: string) {
  return studentFetch<{ message: string }>('/student/logout', {
    token,
    method: 'POST',
  });
}

export function studentUpdateProfile(
  token: string,
  payload: {
    name: string;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    parent_name?: string | null;
    parent_phone?: string | null;
    preparation?: string | null;
  },
) {
  return studentFetch<{ message: string; student: Student; library: Library | null }>(
    '/student/profile',
    {
      token,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export function studentChangePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
  newPasswordConfirmation: string,
) {
  return studentFetch<{ message: string }>('/student/change-password', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirmation: newPasswordConfirmation,
    }),
  });
}

export function studentRegisterDeviceToken(
  token: string,
  fcmToken: string,
  platform: 'android' | 'ios' | 'unknown',
) {
  return studentFetch<{ message: string }>('/student/device-token', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fcm_token: fcmToken, platform }),
  });
}

export function studentCheckIn(token: string, punchInTime?: string | null) {
  return studentFetch<{ message: string; attendance: Record<string, unknown> }>(
    '/student/check-in',
    {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        punchInTime ? { punch_in_time: punchInTime } : {},
      ),
    },
  );
}

export function studentCheckOut(token: string, punchOutTime?: string | null) {
  return studentFetch<{ message: string; attendance: Record<string, unknown> }>(
    '/student/check-out',
    {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        punchOutTime ? { punch_out_time: punchOutTime } : {},
      ),
    },
  );
}

export function studentQrPunch(
  token: string,
  payload: { qr_payload: string; action?: 'auto' | 'punch_in' | 'punch_out' },
) {
  return studentFetch<{ message: string; action: 'punch_in' | 'punch_out'; attendance: Record<string, unknown> }>(
    '/student/attendance/qr-punch',
    {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export function studentAttendance(token: string, month?: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : '';
  return studentFetch<{ month: string; rows: AttendanceRow[] }>(
    `/student/attendance${q}`,
    { token, method: 'GET' },
  );
}

export function studentMonthlyFees(token: string, month?: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : '';
  return studentFetch<{
    billing_mode: string;
    advance_balance: number;
    rows: MonthlyBillRow[];
  }>(`/student/fees/monthly${q}`, {
    token,
    method: 'GET',
  });
}

export function studentAllTimeFees(token: string) {
  return studentFetch<{
    billing_mode: string;
    advance_balance: number;
    total_billed: number;
    total_paid: number;
    total_due: number;
    bill_count: number;
  }>('/student/fees/all-time', { token, method: 'GET' });
}

export function studentHolidays(token: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const q = params.toString() ? `?${params.toString()}` : '';
  return studentFetch<{
    rows: HolidayRow[];
    library_status: Library['status'];
  }>(`/student/holidays${q}`, { token, method: 'GET' });
}

export function studentNotices(token: string, page = 1) {
  return studentFetch<{
    unread_count: number;
    rows: NoticeRow[];
    meta: NoticesMeta;
  }>(`/student/notices?page=${page}`, { token, method: 'GET' });
}

export function studentMarkNoticeRead(token: string, recipientId: number) {
  return studentFetch<{ message: string; read_at: string | null }>(
    `/student/notices/${recipientId}/read`,
    { token, method: 'PATCH' },
  );
}

function directoryQuery(params: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      q.set(key, String(value));
    }
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function publicLibraryDirectory(params: Record<string, string | number | null | undefined> = {}) {
  const q = directoryQuery(params);
  return studentFetch<{
    rows: LibraryDirectoryRow[];
    areas: LibraryDirectoryArea[];
    logged_in: boolean;
  }>(`/library-directory${q}`, { skipAuth: true, method: 'GET' }).catch((error) => {
    if (error instanceof ApiError && error.status === 404) {
      return studentFetch(`/libraries/discover${q}`, { skipAuth: true, method: 'GET' });
    }
    throw error;
  });
}

export function studentLibraryDirectory(
  token: string,
  params: Record<string, string | number | null | undefined> = {},
) {
  const q = directoryQuery(params);
  return studentFetch<{
    rows: LibraryDirectoryRow[];
    areas: LibraryDirectoryArea[];
    logged_in: boolean;
  }>(`/student/library-directory${q}`, { token, method: 'GET' }).catch((error) => {
    if (error instanceof ApiError && error.status === 404) {
      return studentFetch(`/student/libraries/discover${q}`, { token, method: 'GET' });
    }
    throw error;
  });
}
