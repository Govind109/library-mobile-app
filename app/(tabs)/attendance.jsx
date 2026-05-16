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

export default function AttendanceScreen() {
  const { token } = useAuth();
  const [month, setMonth] = useState(ymNow());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => Number(ymNow().slice(0, 4)));

  const load = useCallback(async () => {
    if (!token) return;
    const data = await studentAttendance(token, month);
    setRows(data.rows);
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
      if (row.date) m.set(row.date, row);
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
    const total = rows.length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, absent, leaves, total, percentage };
  }, [rows]);

  const progressRotation = Math.max(0, Math.min(360, Math.round((summary.percentage / 100) * 360)));

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
            <View style={[cardFlat(), styles.overallCard]}>
              <View style={styles.overallLeft}>
                <Text style={styles.overallLabel}>Overall Attendance</Text>
                <Text style={styles.overallPercent}>{summary.percentage}%</Text>
                <Text style={styles.overallMeta}>
                  Present {summary.present} of {summary.total || 0} days
                </Text>
              </View>
              <View style={styles.ringWrap}>
                <View style={styles.ringBase} />
                <View
                  style={[
                    styles.ringProgress,
                    { transform: [{ rotate: `${progressRotation - 90}deg` }] },
                  ]}
                />
                <View style={styles.ringInner} />
              </View>
            </View>

            <View style={styles.statRow}>
              <View style={[cardFlat(), styles.statCard]}>
                <View style={[styles.statDot, { backgroundColor: '#0ea85f' }]} />
                <Text style={styles.statTitle}>Present</Text>
                <Text style={[styles.statValue, { color: '#0ea85f' }]}>{summary.present}</Text>
              </View>
              <View style={[cardFlat(), styles.statCard]}>
                <View style={[styles.statDot, { backgroundColor: '#ef4444' }]} />
                <Text style={styles.statTitle}>Absent</Text>
                <Text style={[styles.statValue, { color: '#ef4444' }]}>{summary.absent}</Text>
              </View>
              <View style={[cardFlat(), styles.statCard]}>
                <View style={[styles.statDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.statTitle}>Leaves</Text>
                <Text style={[styles.statValue, { color: '#f59e0b' }]}>{summary.leaves}</Text>
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
    paddingTop: layout.space.md,
    paddingBottom: layout.space.xxl,
    paddingHorizontal: layout.space.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: layout.space.md,
  },
  monthArrowBtn: {
    width: 38,
    height: 38,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  monthDropdownText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  monthBtnPressed: {
    opacity: 0.7,
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
  overallCard: {
    padding: layout.space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overallLeft: {
    flex: 1,
    paddingRight: 8,
  },
  overallLabel: {
    ...typography.caption,
    color: palette.textSecondary,
    marginBottom: 4,
    fontWeight: '600',
  },
  overallPercent: {
    fontSize: 40,
    fontWeight: '700',
    color: palette.text,
    lineHeight: 42,
    letterSpacing: -0.9,
  },
  overallMeta: {
    marginTop: 4,
    ...typography.caption,
    color: palette.textSecondary,
  },
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
    marginTop: layout.space.md,
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    paddingVertical: 12,
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
    fontSize: 24,
    fontWeight: '700',
  },
  loader: {
    marginTop: 48,
  },
  calendarCard: {
    padding: layout.space.lg,
    marginTop: layout.space.md,
  },
  calendarTitle: {
    ...typography.headline,
    marginBottom: layout.space.sm,
    fontSize: 17,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 10,
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
    rowGap: 8,
  },
  dayEmpty: {
    width: '14.285%',
    height: 44,
  },
  dayCell: {
    width: '14.285%',
    height: 44,
    borderRadius: 22,
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
    fontSize: 14,
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
