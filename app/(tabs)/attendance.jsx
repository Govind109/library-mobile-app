import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { studentAttendance } from '@/lib/api/studentApi';
import { shiftMonth, ymNow } from '@/lib/format';
import { cardFlat, layout, palette, typography } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getMonthMeta(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, (m || 1) - 1, 1);
  const daysInMonth = new Date(y, m || 1, 0).getDate();
  return { year: y, monthIndex: (m || 1) - 1, firstDay: first.getDay(), daysInMonth };
}

function toMonthTitle(month) {
  const { year, monthIndex } = getMonthMeta(month);
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function toShortMonthTitle(month) {
  const { year, monthIndex } = getMonthMeta(month);
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function statusTone(status) {
  const s = `${status || ''}`.toLowerCase();
  if (s.includes('present') || s.includes('late')) return { dot: '#0ea85f', txt: '#0b8a4f' };
  if (s.includes('absent')) return { dot: '#ef4444', txt: '#b91c1c' };
  if (s.includes('leave')) return { dot: '#f59e0b', txt: '#b45309' };
  if (s.includes('holiday')) return { dot: '#60a5fa', txt: '#2563eb' };
  return { dot: palette.textHint, txt: palette.textMuted };
}

function formatDuration(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return '0m';
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(' ') || '0m';
}

export default function AttendanceScreen() {
  const { token } = useAuth();
  const [month, setMonth] = useState(ymNow());
  const [rows, setRows] = useState([]);
  const [monthSummary, setMonthSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => Number(ymNow().slice(0, 4)));

  const load = useCallback(async () => {
    if (!token) return;
    const data = await studentAttendance(token, month);
    setRows(data.rows);
    setMonthSummary(data.summary ?? null);
  }, [token, month]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const rowsByDate = useMemo(() => {
    const m = new Map();
    for (const row of rows) {
      if (!row.date) continue;
      const existing = m.get(row.date);
      if (!existing) {
        m.set(row.date, row);
        continue;
      }
      const sessions = [
        ...(Array.isArray(existing.punch_sessions) ? existing.punch_sessions : []),
        ...(Array.isArray(row.punch_sessions) ? row.punch_sessions : []),
      ];
      const punchOuts = [existing.punch_out_at, row.punch_out_at].filter(Boolean).sort();
      m.set(row.date, {
        ...existing,
        slot_label: existing.slot_label === row.slot_label ? existing.slot_label : 'Multiple slots',
        punch_in_at: [existing.punch_in_at, row.punch_in_at].filter(Boolean).sort()[0] ?? null,
        punch_out_at: punchOuts[punchOuts.length - 1] ?? null,
        worked_minutes: Number(existing.worked_minutes || 0) + Number(row.worked_minutes || 0),
        punch_sessions: sessions,
      });
    }
    return m;
  }, [rows]);

  const calendarCells = useMemo(() => {
    const { year, monthIndex, firstDay, daysInMonth } = getMonthMeta(month);
    const cells = [];
    for (let i = 0; i < firstDay; i += 1) cells.push({ key: `empty-${i}`, empty: true });
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${`${monthIndex + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
      cells.push({ key: date, empty: false, day, date, row: rowsByDate.get(date) ?? null });
    }
    return cells;
  }, [month, rowsByDate]);

  useEffect(() => {
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
    if (todayYmd.startsWith(`${month}-`)) {
      setSelectedDate(todayYmd);
      return;
    }
    const firstDataDate = rows.find((r) => r.date)?.date ?? null;
    setSelectedDate(firstDataDate);
  }, [month, rows]);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let leaves = 0;
    for (const row of rows) {
      const s = `${row?.status || ''}`.toLowerCase();
      if (s.includes('present') || s.includes('late')) present += 1;
      else if (s.includes('absent')) absent += 1;
      else if (s.includes('leave')) leaves += 1;
    }
    const total = monthSummary?.eligible_days ?? rows.length;
    present = monthSummary?.present_days ?? present;
    absent = monthSummary?.missed_days ?? absent;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, absent, leaves, total, percentage };
  }, [rows, monthSummary]);

  const selectedRow = selectedDate ? rowsByDate.get(selectedDate) ?? null : null;
  const selectedPunches = Array.isArray(selectedRow?.punch_sessions) ? selectedRow.punch_sessions : [];

  function openMonthPicker() {
    const year = Number(month.slice(0, 4));
    setPickerYear(Number.isFinite(year) ? year : new Date().getFullYear());
    setMonthPickerOpen(true);
  }

  function selectPickerMonth(monthIndex) {
    setMonth(`${pickerYear}-${`${monthIndex + 1}`.padStart(2, '0')}`);
    setMonthPickerOpen(false);
  }

  return (
    <ScreenWithBanner>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }>
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
            style={({ pressed }) => [styles.monthArrowBtn, pressed && styles.monthBtnPressed]}>
            <FontAwesome name="chevron-left" size={14} color={palette.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose attendance month"
            onPress={openMonthPicker}
            style={({ pressed }) => [styles.monthDropdown, pressed && styles.monthBtnPressed]}>
            <FontAwesome name="calendar" size={14} color={palette.primary} />
            <Text style={styles.monthDropdownText}>{toMonthTitle(month)}</Text>
            <FontAwesome name="chevron-down" size={12} color={palette.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
            style={({ pressed }) => [styles.monthArrowBtn, pressed && styles.monthBtnPressed]}>
            <FontAwesome name="chevron-right" size={14} color={palette.textSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color={palette.primary} />
        ) : (
          <>
            <View style={[cardFlat(), styles.summaryCard]}>
              <View style={styles.summaryMain}>
                <Text style={styles.summaryPercent}>{summary.percentage}%</Text>
                <View style={styles.summaryTextCol}>
                  <Text style={styles.summaryTitle}>Monthly Attendance</Text>
                  <Text style={styles.summaryMeta}>Present {summary.present} of {summary.total || 0} open days</Text>
                </View>
              </View>
              <View style={styles.summaryChips}>
                <Text style={[styles.summaryChip, styles.summaryChipPresent]}>P {summary.present}</Text>
                <Text style={[styles.summaryChip, styles.summaryChipAbsent]}>A {summary.absent}</Text>
                <Text style={[styles.summaryChip, styles.summaryChipLeave]}>L {summary.leaves}</Text>
              </View>
            </View>

            <View style={[cardFlat(), styles.calendarCard]}>
              <Text style={styles.calendarTitle}>Attendance Overview</Text>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text key={`${w}-${i}`} style={styles.weekLabel}>
                    {w}
                  </Text>
                ))}
              </View>
              <View style={styles.grid}>
                {calendarCells.map((cell) => {
                  if (cell.empty) return <View key={cell.key} style={styles.dayEmpty} />;
                  const tone = statusTone(cell.row?.status);
                  const active = selectedDate === cell.date;
                  return (
                    <Pressable
                      key={cell.key}
                      onPress={() => setSelectedDate(cell.date)}
                      style={({ pressed }) => [styles.dayCell, active && styles.dayCellActive, pressed && styles.dayPressed]}>
                      <Text style={[styles.dayNum, active && styles.dayNumActive]}>{cell.day}</Text>
                      {cell.row ? <View style={[styles.statusDot, { backgroundColor: tone.dot }]} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {selectedRow ? (
              <View style={[cardFlat(), styles.detailCard]}>
                <View style={styles.detailHead}>
                  <View>
                    <Text style={styles.detailTitle}>Day punch history</Text>
                    <Text style={styles.detailMeta}>
                      {selectedRow.date} · {selectedRow.slot_label || 'Time slot'}
                    </Text>
                  </View>
                  <Text style={[styles.detailStatus, { color: statusTone(selectedRow.status).txt }]}>
                    {selectedRow.status || '—'}
                  </Text>
                </View>
                <View style={styles.durationRow}>
                  <Text style={styles.durationText}>Stayed: {formatDuration(selectedRow.worked_minutes)}</Text>
                  <Text style={styles.durationSub}>First in {selectedRow.punch_in_at || '—'} · Last out {selectedRow.punch_out_at || '—'}</Text>
                </View>
                {selectedPunches.length ? (
                  selectedPunches.map((punch, index) => (
                    <View key={`${punch.punch_in_at}-${index}`} style={styles.punchRow}>
                      <Text style={styles.punchIndex}>#{index + 1}</Text>
                      <Text style={styles.punchText}>{punch.punch_in_at || '—'} → {punch.punch_out_at || 'Open'}</Text>
                      <Text style={styles.punchDuration}>{formatDuration(punch.worked_minutes)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.detailMeta}>No detailed punches saved for this day.</Text>
                )}
              </View>
            ) : null}
          </>
        )}

        {!loading && rows.length === 0 ? <Text style={styles.empty}>No attendance for this month.</Text> : null}
      </ScrollView>
      <Modal
        animationType="fade"
        transparent
        visible={monthPickerOpen}
        onRequestClose={() => setMonthPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMonthPickerOpen(false)}>
          <Pressable style={styles.monthPickerCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.monthPickerHead}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous year"
                onPress={() => setPickerYear((year) => year - 1)}
                style={({ pressed }) => [styles.yearBtn, pressed && styles.monthBtnPressed]}>
                <FontAwesome name="chevron-left" size={14} color={palette.text} />
              </Pressable>
              <Text style={styles.monthPickerTitle}>{pickerYear}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next year"
                onPress={() => setPickerYear((year) => year + 1)}
                style={({ pressed }) => [styles.yearBtn, pressed && styles.monthBtnPressed]}>
                <FontAwesome name="chevron-right" size={14} color={palette.text} />
              </Pressable>
            </View>
            <View style={styles.monthGrid}>
              {MONTH_NAMES.map((label, index) => {
                const value = `${pickerYear}-${`${index + 1}`.padStart(2, '0')}`;
                const active = value === month;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    onPress={() => selectPickerMonth(index)}
                    style={({ pressed }) => [styles.monthOption, active && styles.monthOptionActive, pressed && styles.monthBtnPressed]}>
                    <Text style={[styles.monthOptionText, active && styles.monthOptionTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.monthPickerActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMonth(ymNow());
                  setMonthPickerOpen(false);
                }}
                style={({ pressed }) => [styles.todayBtn, pressed && styles.monthBtnPressed]}>
                <Text style={styles.todayBtnText}>Current month</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setMonthPickerOpen(false)}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.monthBtnPressed]}>
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenWithBanner>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  content: {
    paddingTop: layout.space.sm,
    paddingBottom: layout.space.xxl,
    paddingHorizontal: layout.space.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: layout.space.sm,
  },
  monthArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  monthDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  monthDropdownText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  monthBtnPressed: {
    opacity: 0.7,
  },
  detailCard: {
    marginTop: layout.space.sm,
    padding: layout.space.md,
    gap: 8,
  },
  detailHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.text,
  },
  detailMeta: {
    marginTop: 2,
    fontSize: 11,
    color: palette.textMuted,
  },
  detailStatus: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  durationRow: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: palette.canvas,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '800',
    color: palette.text,
  },
  durationSub: {
    marginTop: 3,
    fontSize: 11,
    color: palette.textMuted,
  },
  punchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  punchIndex: {
    width: 28,
    fontSize: 11,
    fontWeight: '800',
    color: palette.primary,
  },
  punchText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: palette.text,
  },
  punchDuration: {
    fontSize: 11,
    color: palette.textMuted,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.space.lg,
  },
  monthPickerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: palette.surface,
    padding: layout.space.lg,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  monthPickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: layout.space.md,
  },
  monthPickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
  },
  yearBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  monthOption: {
    width: '30.8%',
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  monthOptionActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  monthOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.text,
  },
  monthOptionTextActive: {
    color: palette.onPrimary,
  },
  monthPickerActions: {
    marginTop: layout.space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  todayBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  todayBtnText: {
    fontWeight: '700',
    color: palette.primary,
  },
  closeBtn: {
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.canvas,
  },
  closeBtnText: {
    fontWeight: '700',
    color: palette.textSecondary,
  },
  summaryCard: {
    padding: layout.space.md,
    gap: 10,
  },
  summaryMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryPercent: {
    minWidth: 70,
    fontSize: 30,
    fontWeight: '800',
    color: palette.primary,
    letterSpacing: -0.8,
  },
  summaryTextCol: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.text,
  },
  summaryMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  summaryChips: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryChip: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 7,
    borderRadius: layout.radius.full,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  summaryChipPresent: { color: '#0b8a4f', backgroundColor: '#dcfce7' },
  summaryChipAbsent: { color: '#b91c1c', backgroundColor: '#fee2e2' },
  summaryChipLeave: { color: '#b45309', backgroundColor: '#fef3c7' },
  ringWrap: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringBase: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 8,
    borderColor: '#e5e7eb',
  },
  ringProgress: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 8,
    borderTopColor: '#0ea85f',
    borderRightColor: '#0ea85f',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  ringInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.surface,
  },
  statRow: {
    marginTop: layout.space.sm,
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginBottom: 4,
  },
  statTitle: {
    ...typography.caption,
    color: palette.textSecondary,
    fontSize: 12,
  },
  statValue: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '700',
  },
  loader: {
    marginTop: 48,
  },
  calendarCard: {
    padding: layout.space.md,
    marginTop: layout.space.sm,
  },
  calendarTitle: {
    ...typography.headline,
    marginBottom: 8,
    fontSize: 15,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekLabel: {
    width: '14.285%',
    textAlign: 'center',
    fontSize: 12,
    color: palette.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
  },
  dayEmpty: {
    width: '14.285%',
    height: 36,
  },
  dayCell: {
    width: '14.285%',
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellActive: {
    backgroundColor: '#1d4ed8',
  },
  dayPressed: {
    opacity: 0.7,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
  },
  dayNumActive: {
    color: '#fff',
  },
  statusDot: {
    marginTop: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  empty: {
    textAlign: 'center',
    marginTop: layout.space.lg,
    ...typography.body,
    color: palette.textMuted,
  },
});
