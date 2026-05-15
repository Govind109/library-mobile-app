import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { ApiError, studentAttendance, studentCheckIn, studentCheckOut, studentHolidays, studentQrPunch } from '@/lib/api/studentApi';
import { formatInr, ymNow } from '@/lib/format';
import { cardFlat, layout, palette, shadow, typography } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import { showPunchInterstitial } from '@/lib/adMob';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TEAL = '#0d9488';
const TEAL_SOFT = '#ccfbf1';

function localYmd() {
  const d = new Date();
  const p = (n) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function greetingPhrase() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function parseTodayPunch(rows) {
  const ymd = localYmd();
  const row = rows.find((r) => r.date === ymd);
  return {
    inStr: row?.punch_in_at ?? null,
    outStr: row?.punch_out_at ?? null,
  };
}

function formatSessionElapsed(inStr, outStr) {
  if (!inStr) return '--:--:--';
  if (outStr) return '00:00:00';
  const [hh, mm] = inStr.split(':').map(Number);
  const start = new Date();
  start.setHours(hh, mm, 0, 0);
  const sec = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => `${n}`.padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

function attendanceModeText(mode) {
  if (mode === 'button_only') return 'Attendance mode: Button check-in/check-out only';
  if (mode === 'qr_only') return 'Attendance mode: QR scan only';
  return 'Attendance mode: Button + QR both available';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { token, student, library, alerts, refreshMe } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [punchBusy, setPunchBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanCooldown, setScanCooldown] = useState(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [holidays, setHolidays] = useState([]);
  const [monthRows, setMonthRows] = useState([]);

  const status = library?.status;
  const open = status?.is_open_now ?? false;
  const attendanceMode = library?.attendance_mode || 'both';
  const allowButtonAttendance = attendanceMode === 'button_only' || attendanceMode === 'both';
  const allowQrAttendance = attendanceMode === 'qr_only' || attendanceMode === 'both';

  const { inStr, outStr } = useMemo(
    () => parseTodayPunch(monthRows),
    [monthRows],
  );

  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    if (!inStr || outStr) return;
    const id = setInterval(() => setTimerTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [inStr, outStr]);

  const sessionClock = useMemo(
    () => formatSessionElapsed(inStr, outStr),
    [inStr, outStr, timerTick],
  );

  const loadMonthAttendance = useCallback(async () => {
    if (!token) return;
    try {
      const data = await studentAttendance(token, ymNow());
      setMonthRows(data.rows);
    } catch {
      setMonthRows([]);
    }
  }, [token]);

  const loadHolidays = useCallback(async () => {
    if (!token) return;
    try {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date();
      to.setMonth(to.getMonth() + 4);
      const data = await studentHolidays(token, from, to.toISOString().slice(0, 10));
      setHolidays(data.rows.filter((h) => h.is_closed).slice(0, 6));
    } catch {
      setHolidays([]);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadMonthAttendance();
    }, [loadMonthAttendance]),
  );

  useEffect(() => {
    void loadHolidays();
  }, [loadHolidays]);

  const perf = useMemo(() => {
    const present = monthRows.filter((r) => r.status === 'present').length;
    const total = monthRows.length;
    const missed = monthRows.filter((r) => r.status === 'absent').length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    let badge = 'KEEP GOING';
    if (total === 0) badge = 'NO DATA YET';
    else if (pct >= 90) badge = 'EXCELLENT STATUS';
    else if (pct >= 70) badge = 'GOOD PROGRESS';
    else if (pct >= 50) badge = 'ROOM TO IMPROVE';
    return { present, total, missed, pct, badge };
  }, [monthRows]);

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await refreshMe();
      await loadMonthAttendance();
      await loadHolidays();
    } finally {
      setRefreshing(false);
    }
  }, [token, refreshMe, loadMonthAttendance, loadHolidays]);

  async function doCheckIn() {
    if (!token) return;
    if (!allowButtonAttendance) {
      Alert.alert('Attendance mode', 'This library accepts attendance only via QR scan.');
      return;
    }
    setPunchBusy(true);
    try {
      await studentCheckIn(token);
      await refreshMe();
      await loadMonthAttendance();
      showPunchInterstitial(() => {
        Alert.alert('Checked in', 'Your check-in was recorded.');
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Check-in failed.';
      Alert.alert('Check-in', msg);
    } finally {
      setPunchBusy(false);
    }
  }

  async function doCheckOut() {
    if (!token) return;
    if (!allowButtonAttendance) {
      Alert.alert('Attendance mode', 'This library accepts attendance only via QR scan.');
      return;
    }
    setPunchBusy(true);
    try {
      await studentCheckOut(token);
      await refreshMe();
      await loadMonthAttendance();
      showPunchInterstitial(() => {
        Alert.alert('Checked out', 'Your check-out was recorded.');
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Check-out failed.';
      Alert.alert('Check-out', msg);
    } finally {
      setPunchBusy(false);
    }
  }

  async function openQrScanner() {
    const perm = camPerm?.granted ? camPerm : await requestCamPerm();
    if (!perm?.granted) {
      Alert.alert('Camera permission', 'Allow camera permission to scan library attendance QR.');
      return;
    }
    setScannerOpen(true);
  }

  async function onScannedAttendanceQr(value) {
    if (!token || scanCooldown || qrBusy) return;
    const payload = String(value ?? '').trim();
    if (!payload) return;
    setScanCooldown(true);
    setQrBusy(true);
    try {
      const data = await studentQrPunch(token, { qr_payload: payload, action: 'auto' });
      await refreshMe();
      await loadMonthAttendance();
      setScannerOpen(false);
      Alert.alert(
        data.action === 'punch_out' ? 'Checked out' : 'Checked in',
        data.message || 'Attendance saved via QR.',
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'QR attendance failed.';
      Alert.alert('QR attendance', msg);
    } finally {
      setQrBusy(false);
      setTimeout(() => setScanCooldown(false), 900);
    }
  }

  const hoursLine =
    status?.opening_time && status?.closing_time
      ? `Hours: ${status.opening_time} – ${status.closing_time}`
      : 'Hours: — – —';

  const statusPillText =
    status?.status_message ?? (open ? 'Library is open.' : 'Library is closed.');

  const readySubtitle = open ? 'Ready for check-in' : 'Check hours below';

  return (
    <ScreenWithBanner>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }>
        <View style={styles.greetBlock}>
          <Text style={styles.greetHi}>
            {greetingPhrase()}, {student?.name?.split(' ')[0] ?? 'Student'}
          </Text>
          <Text style={styles.greetDash}>Your Dashboard.</Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusBlobA} />
          <View style={styles.statusBlobB} />
          <View style={styles.statusTop}>
            <View style={styles.statusTitleRow}>
              <View style={styles.sunIconBox}>
                <FontAwesome name="sun-o" size={16} color={TEAL} />
              </View>
              <View>
                <Text style={styles.statusOverline}>Library status</Text>
                <Text style={styles.statusSub}>{readySubtitle}</Text>
              </View>
            </View>
            <Text style={styles.openChip}>{open ? 'OPEN' : 'CLOSED'}</Text>
          </View>
          <View style={styles.whitePill}>
            <View style={[styles.pillDot, open ? styles.dotOn : styles.dotOff]} />
            <Text style={styles.pillText} numberOfLines={2}>
              {statusPillText}
            </Text>
          </View>
          <View style={styles.hoursRow}>
            <FontAwesome name="clock-o" size={14} color={palette.textMuted} />
            <Text style={styles.hoursText}>{hoursLine}</Text>
          </View>
          <View style={styles.hoursRow}>
            <FontAwesome name="check-square-o" size={14} color={palette.textMuted} />
            <Text style={styles.hoursText}>{attendanceModeText(attendanceMode)}</Text>
          </View>
        </View>

        {allowButtonAttendance ? (
          <View style={styles.sessionCard}>
            <View style={styles.sessionLeft}>
              <Text style={styles.sessionLabel}>Session timer</Text>
              <View style={styles.timerRow}>
                <View style={styles.timerDot} />
                <Text style={styles.timerDigits}>{sessionClock}</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.checkInCta,
                (!open || punchBusy || !allowButtonAttendance) && styles.ctaDisabled,
                pressed && open && !punchBusy && allowButtonAttendance && { opacity: 0.92 },
              ]}
              onPress={() => void doCheckIn()}
              disabled={!open || punchBusy || !allowButtonAttendance}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
              <FontAwesome name="sign-in" size={20} color="#fff" />
              <Text style={styles.checkInText}>Check-In</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.modeInfoCard}>
            <Text style={styles.modeInfoTitle}>Button attendance disabled by library</Text>
            <Text style={styles.modeInfoBody}>Use the QR scanner below to mark attendance.</Text>
          </View>
        )}

        {inStr && !outStr ? (
          <Pressable
            style={[styles.checkOutLink, punchBusy && { opacity: 0.6 }]}
            onPress={() => {
              if (allowButtonAttendance) {
                void doCheckOut();
              } else {
                void openQrScanner();
              }
            }}
            disabled={punchBusy || (allowQrAttendance ? qrBusy : false)}>
            <FontAwesome name="sign-out" size={14} color={palette.primary} />
            <Text style={styles.checkOutText}>
              {allowButtonAttendance ? 'Check out for today' : 'Check out (scan QR)'}
            </Text>
          </Pressable>
        ) : null}

        {allowQrAttendance ? (
        <View style={styles.qrPunchCard}>
          <View>
            <Text style={styles.qrPunchTitle}>Scan library attendance QR</Text>
            <Text style={styles.qrPunchSub}>Use today's QR shown on library desktop to punch in/out.</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.qrPunchBtn,
              (qrBusy || punchBusy) && styles.ctaDisabled,
              pressed && !qrBusy && !punchBusy && { opacity: 0.92 },
            ]}
            onPress={() => void openQrScanner()}
            disabled={qrBusy || punchBusy}
          >
            <FontAwesome name="qrcode" size={16} color="#fff" />
            <Text style={styles.qrPunchBtnText}>{qrBusy ? 'Please wait...' : 'Scan QR'}</Text>
          </Pressable>
          {scannerOpen ? (
            <View style={styles.scannerWrap}>
              <CameraView
                style={styles.scannerView}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(res) => void onScannedAttendanceQr(res?.data)}
              />
              <Pressable style={styles.scannerCloseBtn} onPress={() => setScannerOpen(false)}>
                <Text style={styles.scannerCloseText}>Close scanner</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        ) : null}

        <View style={[cardFlat(), styles.perfCard]}>
          <View style={styles.perfTop}>
            <View>
              <Text style={styles.perfOverline}>Performance</Text>
              <Text style={styles.perfTitle}>Attendance</Text>
              <Text style={styles.perfMicro}>Monthly overall status</Text>
            </View>
            <View style={styles.chartIconBox}>
              <FontAwesome name="area-chart" size={18} color={TEAL} />
            </View>
          </View>
          <View style={styles.perfMid}>
            <View>
              <Text style={styles.perfPct}>{perf.pct}%</Text>
              <Text style={styles.perfSub}>
                Present {perf.present} of {perf.total} records
              </Text>
            </View>
            <View style={styles.missedBox}>
              <Text style={styles.missedLabel}>Missed</Text>
              <Text style={styles.missedNum}>{perf.missed}</Text>
            </View>
          </View>
          <View style={styles.perfBarBg}>
            <View style={[styles.perfBarFill, { width: `${Math.min(100, perf.pct)}%` }]} />
          </View>
          <View style={styles.excellentPill}>
            <Text style={styles.excellentText}>{perf.badge}</Text>
          </View>
        </View>

        {alerts.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHdr}>Alerts</Text>
            {alerts.map((a) => (
              <View key={a.id} style={[cardFlat(), styles.alertItem]}>
                <Text style={styles.alertT}>{a.title}</Text>
                <Text style={styles.alertM} numberOfLines={3}>
                  {a.message}
                </Text>
                {a.type === 'payment_due' && typeof a.meta?.total_due === 'number' ? (
                  <Text style={styles.alertDue}>{formatInr(a.meta.total_due)} due</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {holidays.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHdr}>Upcoming closed days</Text>
            {holidays.map((h) => (
              <View key={h.id} style={styles.holidayItem}>
                <Text style={styles.holidayDate}>{h.holiday_date}</Text>
                <Text style={styles.holidayTit} numberOfLines={1}>
                  {h.title}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {student?.time_slots && student.time_slots.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHdr}>Your slots</Text>
            {student.time_slots.map((s) => (
              <View key={s.id} style={styles.slotLine}>
                <FontAwesome name="clock-o" size={14} color={palette.primary} />
                <Text style={styles.slotTxt}>
                  {s.label ? `${s.label} · ` : ''}
                  {s.slot_start} – {s.slot_end}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ScreenWithBanner>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.space.lg, backgroundColor: palette.canvas },
  greetBlock: { marginBottom: layout.space.xl },
  greetHi: { fontSize: 16, fontWeight: '500', color: palette.primary, letterSpacing: -0.2 },
  greetDash: { marginTop: 6, fontSize: 24, fontWeight: '800', color: palette.primaryDark, letterSpacing: -0.6 },
  statusCard: {
    backgroundColor: palette.mintSoft,
    borderRadius: layout.radius.xxl,
    padding: layout.space.xl,
    marginBottom: layout.space.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 148, 136, 0.15)',
  },
  statusBlobA: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(16, 185, 129, 0.12)', top: -30, right: -20 },
  statusBlobB: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(13, 148, 136, 0.08)', bottom: 20, left: -15 },
  statusTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 },
  statusTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  sunIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: TEAL_SOFT, alignItems: 'center', justifyContent: 'center' },
  statusOverline: { color: TEAL, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  statusSub: { marginTop: 4, fontSize: 13, color: palette.textSecondary, fontWeight: '500' },
  openChip: { color: TEAL, fontSize: 13, fontWeight: '900', letterSpacing: 1.2, zIndex: 1 },
  whitePill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', alignSelf: 'flex-start', marginTop: layout.space.lg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: layout.radius.full, zIndex: 1, maxWidth: '100%', ...shadow.sm },
  pillDot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: palette.success },
  dotOff: { backgroundColor: palette.danger },
  pillText: { flex: 1, fontSize: 14, fontWeight: '600', color: palette.text },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: layout.space.md, zIndex: 1 },
  hoursText: { fontSize: 13, color: palette.textSecondary, fontWeight: '500' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.surface, borderRadius: layout.radius.xxl, padding: layout.space.xl, marginBottom: layout.space.md, ...shadow.md },
  sessionLeft: { flex: 1, minWidth: 0 },
  sessionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: palette.textMuted },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  timerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: TEAL },
  timerDigits: { fontSize: 26, fontWeight: '800', letterSpacing: 1, color: palette.primary, fontVariant: ['tabular-nums'] },
  checkInCta: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.primary, paddingHorizontal: 22, paddingVertical: 16, borderRadius: layout.radius.lg, ...shadow.sm },
  ctaDisabled: { opacity: 0.42 },
  checkInText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
  checkOutLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: layout.space.lg },
  checkOutText: { fontSize: 14, fontWeight: '700', color: palette.primary },
  qrPunchCard: { backgroundColor: palette.surface, borderRadius: layout.radius.xl, padding: layout.space.lg, marginBottom: layout.space.lg, gap: layout.space.md, ...shadow.sm },
  qrPunchTitle: { fontSize: 15, fontWeight: '800', color: palette.text },
  qrPunchSub: { marginTop: 4, fontSize: 12, color: palette.textMuted },
  qrPunchBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.primary, borderRadius: layout.radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  qrPunchBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  scannerWrap: { marginTop: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  scannerView: { width: '100%', height: 260 },
  scannerCloseBtn: { backgroundColor: '#111827', paddingVertical: 10, alignItems: 'center' },
  scannerCloseText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modeInfoCard: { backgroundColor: palette.surface, borderRadius: layout.radius.xl, padding: layout.space.lg, marginBottom: layout.space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, ...shadow.sm },
  modeInfoTitle: { fontSize: 14, fontWeight: '800', color: palette.text },
  modeInfoBody: { marginTop: 6, fontSize: 12, color: palette.textMuted },
  perfCard: { padding: layout.space.xl, marginBottom: layout.space.lg, ...shadow.sm },
  perfTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  perfOverline: { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, color: TEAL },
  perfTitle: { marginTop: 4, fontSize: 18, fontWeight: '800', color: palette.text, letterSpacing: -0.3 },
  perfMicro: { marginTop: 4, fontSize: 12, color: palette.textMuted },
  chartIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: TEAL_SOFT, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(13, 148, 136, 0.2)' },
  perfMid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: layout.space.xl },
  perfPct: { fontSize: 36, fontWeight: '800', color: palette.primary, letterSpacing: -1 },
  perfSub: { marginTop: 4, fontSize: 12, color: palette.textMuted, fontWeight: '500' },
  missedBox: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.md, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: palette.surfaceMuted, minWidth: 88, alignItems: 'center' },
  missedLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: palette.textMuted },
  missedNum: { marginTop: 4, fontSize: 22, fontWeight: '800', color: palette.text },
  perfBarBg: { height: 8, borderRadius: 4, backgroundColor: palette.primarySoft, marginTop: layout.space.lg, overflow: 'hidden' },
  perfBarFill: { height: '100%', borderRadius: 4, backgroundColor: palette.primary },
  excellentPill: { alignSelf: 'flex-start', marginTop: layout.space.md, backgroundColor: TEAL_SOFT, paddingHorizontal: 14, paddingVertical: 8, borderRadius: layout.radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(13, 148, 136, 0.25)' },
  excellentText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6, color: TEAL },
  section: { marginBottom: layout.space.lg },
  sectionHdr: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: palette.textMuted, marginBottom: layout.space.sm, textTransform: 'uppercase' },
  alertItem: { padding: layout.space.lg, marginBottom: layout.space.sm },
  alertT: { fontSize: 15, fontWeight: '700', color: palette.text },
  alertM: { marginTop: 6, fontSize: 14, color: palette.textSecondary, lineHeight: 20 },
  alertDue: { marginTop: 8, fontWeight: '800', color: palette.warning },
  holidayItem: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.borderSubtle },
  holidayDate: { fontSize: 12, fontWeight: '800', color: TEAL, width: 88 },
  holidayTit: { flex: 1, fontSize: 14, fontWeight: '600', color: palette.text },
  slotLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  slotTxt: { fontSize: 14, fontWeight: '600', color: palette.text },
});
