export type StudentStatus = 'active' | 'inactive' | string;

export interface TimeSlot {
  id: number;
  seat_id?: number | null;
  seat_number?: string | null;
  seat_type?: string | null;
  slot_start: string;
  slot_end: string;
  label: string | null;
  fee_amount?: number | string | null;
}

export interface Student {
  id: number;
  name: string;
  login_id: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  preparation: string | null;
  status: StudentStatus;
  joining_date: string | null;
  photo_url: string | null;
  /** postpaid | prepaid */
  billing_mode?: string;
  advance_balance?: number;
  digital_id_token?: string;
  digital_id_qr_payload?: string;
  time_slots: TimeSlot[];
}

export interface LibraryStatus {
  is_open_now: boolean;
  status_message: string;
  today_is_holiday?: boolean;
  opening_time?: string | null;
  closing_time?: string | null;
  weekly_off_days?: string[];
  is_24x7?: boolean;
}

export interface Library {
  id: number;
  name: string;
  unique_id: string;
  address: string | null;
  logo_url: string | null;
  opening_time: string | null;
  closing_time: string | null;
  weekly_off_days: string[];
  is_24x7?: boolean;
  attendance_mode?: 'button_only' | 'qr_only' | 'both' | string;
  feature_access?: Record<string, boolean>;
  status: LibraryStatus;
}

export interface LibraryDirectoryRow {
  id: number;
  name: string;
  unique_id: string;
  address: string | null;
  logo_url: string | null;
  opening_time: string | null;
  closing_time: string | null;
  listing_is_public: boolean;
  listing_area: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  listing_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  listing_description: string | null;
  amenities: string[];
  monthly_fee_min: number | null;
  seat_capacity: number | null;
  active_students_count: number | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  public_email: string | null;
}

export interface LibraryDirectoryArea {
  listing_area: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  total: number;
}

export interface StartupAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface AttendanceRow {
  date: string | null;
  seat_time_slot_id?: number | null;
  slot_start?: string | null;
  slot_end?: string | null;
  slot_label?: string | null;
  status: string;
  punch_in_at: string | null;
  punch_out_at: string | null;
  punch_in_channel?: 'button' | 'qr' | null;
  worked_minutes: number | null;
}

export interface AttendanceSummary {
  eligible_days: number;
  present_days: number;
  missed_days: number;
  percentage: number;
}

export interface MonthlyBillRow {
  id: number;
  month: string | null;
  service_period_start?: string | null;
  service_period_end?: string | null;
  service_period_label?: string | null;
  amount: string | number;
  status: string;
  paid_amount: number;
  due_amount: number;
  paid_at: string | null;
}

export interface NoticeRow {
  id: number;
  notice_id: number;
  title: string;
  message: string;
  sent_at: string | null;
  read_at: string | null;
}

export interface NoticesMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface HolidayRow {
  id: number;
  holiday_date: string | null;
  title: string;
  description: string | null;
  is_closed: boolean;
}
