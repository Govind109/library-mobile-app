import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { cardFlat, layout, palette, shadow } from '@/constants/Theme';
import { studentAllTimeFees, studentAttendance, studentNotices } from '@/lib/api/studentApi';
import { formatInr, ymNow } from '@/lib/format';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function Shell({ title, subtitle, icon, loading, onRefresh, children }) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenWithBanner>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}
        refreshControl={<RefreshControl refreshing={Boolean(loading)} onRefresh={onRefresh} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <FontAwesome name={icon} size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroKicker}>My Library</Text>
            <Text style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroSub}>{subtitle}</Text>
          </View>
        </View>
        {loading ? <ActivityIndicator color={palette.primary} style={{ marginVertical: layout.space.md }} /> : null}
        {children}
      </ScrollView>
    </ScreenWithBanner>
  );
}

function EmptyState({ text }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function LibraryAttendanceTab() {
  const { token, library } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);

  async function load() {
    if (!token || !library) return;
    setLoading(true);
    try {
      const data = await studentAttendance(token, ymNow());
      setRows(data.rows ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, library?.id]);

  return (
    <Shell title="Attendance" subtitle="Monthly presence and recent punch history." icon="calendar" loading={loading} onRefresh={load}>
      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{summary?.present_days ?? 0}</Text>
          <Text style={styles.statLabel}>Present</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{summary?.attendance_rate ?? summary?.percentage ?? 0}%</Text>
          <Text style={styles.statLabel}>Rate</Text>
        </View>
      </View>
      <View style={[cardFlat(), styles.card]}>
        <Text style={styles.cardTitle}>Recent days</Text>
        {rows.length ? rows.slice(0, 12).map((row, index) => (
          <View key={`${row.date ?? index}`} style={styles.infoRow}>
            <Text style={styles.infoTitle}>{row.date ?? 'Date'}</Text>
            <Text style={styles.infoSub}>{row.status_label ?? row.status ?? 'Attendance'} · {row.total_hours ?? row.duration ?? '-'}</Text>
          </View>
        )) : <EmptyState text="No attendance data found for this month." />}
      </View>
    </Shell>
  );
}

export function LibraryFeesTab() {
  const { token, library } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  async function load() {
    if (!token || !library) return;
    setLoading(true);
    try {
      setData(await studentAllTimeFees(token));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, library?.id]);

  const rows = data?.rows ?? [];
  return (
    <Shell title="Fees" subtitle="Due, paid and advance payment summary." icon="money" loading={loading} onRefresh={load}>
      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatInr(data?.total_due ?? 0)}</Text>
          <Text style={styles.statLabel}>Due</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatInr(data?.advance_balance ?? 0)}</Text>
          <Text style={styles.statLabel}>Advance</Text>
        </View>
      </View>
      <View style={[cardFlat(), styles.card]}>
        <Text style={styles.cardTitle}>Bills</Text>
        {rows.length ? rows.slice(0, 12).map((row, index) => (
          <View key={`${row.month ?? index}`} style={styles.infoRow}>
            <Text style={styles.infoTitle}>{row.month ?? row.billing_month ?? 'Month'}</Text>
            <Text style={styles.infoSub}>{formatInr(row.total_amount ?? row.amount ?? 0)} · {row.status ?? 'pending'}</Text>
          </View>
        )) : <EmptyState text="No fee bills found yet." />}
      </View>
    </Shell>
  );
}

export function LibraryNoticesTab() {
  const { token, library } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  async function load() {
    if (!token || !library) return;
    setLoading(true);
    try {
      const data = await studentNotices(token, 1);
      setRows(data.rows ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, library?.id]);

  return (
    <Shell title="Notices" subtitle="Latest updates from your library." icon="bell" loading={loading} onRefresh={load}>
      <View style={[cardFlat(), styles.card]}>
        {rows.length ? rows.map((row, index) => (
          <View key={`${row.id ?? index}`} style={styles.noticeBox}>
            <Text style={styles.infoTitle}>{row.title ?? row.subject ?? 'Notice'}</Text>
            <Text style={styles.infoSub}>{row.message ?? row.body ?? row.description ?? ''}</Text>
          </View>
        )) : <EmptyState text="No notices from your library yet." />}
      </View>
    </Shell>
  );
}

export function LibraryProfileTab() {
  const { student, library } = useAuth();
  const slots = Array.isArray(student?.time_slots) ? student.time_slots : [];
  const seatLabels = slots.map((slot) => slot.seat_label || slot.seat?.seat_no || slot.seat_no).filter(Boolean);

  return (
    <Shell title="Profile" subtitle="Library membership and assigned details." icon="user" loading={false} onRefresh={() => {}}>
      <View style={[cardFlat(), styles.card]}>
        <Text style={styles.cardTitle}>{student?.name || 'Student'}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoTitle}>Library</Text>
          <Text style={styles.infoSub}>{library?.name || student?.library?.name || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoTitle}>Student ID</Text>
          <Text style={styles.infoSub}>{student?.login_id || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoTitle}>Seats</Text>
          <Text style={styles.infoSub}>{seatLabels.length ? [...new Set(seatLabels)].join(', ') : 'Seat not assigned'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoTitle}>Slots</Text>
          <Text style={styles.infoSub}>{slots.length ? `${slots.length} assigned` : 'No slot assigned'}</Text>
        </View>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.space.lg, gap: layout.space.md },
  hero: {
    minHeight: 118,
    borderRadius: 28,
    padding: layout.space.lg,
    backgroundColor: '#1A367C',
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.space.md,
    ...shadow.md,
  },
  heroIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  heroKicker: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', letterSpacing: 0.7 },
  heroTitle: { marginTop: 3, fontSize: 23, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  heroSub: { marginTop: 5, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.78)', lineHeight: 18 },
  statRow: { flexDirection: 'row', gap: layout.space.sm },
  statBox: { flex: 1, padding: layout.space.md, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)', ...shadow.sm },
  statValue: { fontSize: 18, fontWeight: '900', color: palette.text },
  statLabel: { marginTop: 3, fontSize: 11, fontWeight: '900', color: palette.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { padding: layout.space.lg },
  cardTitle: { fontSize: 17, fontWeight: '900', color: palette.text, marginBottom: layout.space.sm },
  infoRow: { paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(15,23,42,0.08)' },
  infoTitle: { fontSize: 14, fontWeight: '900', color: palette.text },
  infoSub: { marginTop: 3, fontSize: 12, fontWeight: '700', color: palette.textMuted, lineHeight: 17 },
  noticeBox: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(15,23,42,0.08)' },
  empty: { fontSize: 13, fontWeight: '700', color: palette.textMuted, lineHeight: 19 },
});
