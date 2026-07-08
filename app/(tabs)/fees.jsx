import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { studentAllTimeFees, studentMonthlyFees } from '@/lib/api/studentApi';
import { useStudentScreenRefresh } from '@/lib/useStudentScreenRefresh';
import { formatInrErp, formatMonthDisplay, shiftMonth, ymNow } from '@/lib/format';
import { layout, palette, shadow, typography } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function getStatusMeta(status) {
  if (status === 'paid') {
    return {
      label: 'Paid',
      bg: palette.successSoft,
      fg: palette.success,
      border: 'rgba(5, 150, 105, 0.25)',
    };
  }
  return {
    label: 'Due',
    bg: palette.dangerSoft,
    fg: palette.danger,
    border: 'rgba(220, 38, 38, 0.25)',
  };
}

export default function FeesScreen() {
  const { token } = useAuth();
  const [month, setMonth] = useState(ymNow());
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [monthly, all] = await Promise.all([
      studentMonthlyFees(token, month),
      studentAllTimeFees(token),
    ]);
    setRows(monthly.rows);
    setSummary(all);
  }, [token, month]);

  const refreshScreen = useCallback(async () => {
    setLoading(true);
    try {
      await load();
    } finally {
      setLoading(false);
    }
  }, [load]);

  useStudentScreenRefresh(refreshScreen, [refreshScreen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const monthAgg = useMemo(() => {
    let billed = 0;
    let paid = 0;
    let due = 0;
    for (const r of rows) {
      billed += Number(r.amount);
      paid += Number(r.paid_amount);
      due += Number(r.due_amount);
    }
    return { billed, paid, due };
  }, [rows]);

  const monthLabel = formatMonthDisplay(month);
  const paidBillCount = rows.filter((r) => r.status === 'paid').length;
  const monthSettled = rows.length > 0 && rows.every((r) => r.status === 'paid');
  const progressPct = summary && summary.total_billed > 0.001
    ? Math.min(100, (summary.total_paid / summary.total_billed) * 100)
    : 0;
  const healthPct =
    summary && summary.total_billed > 0.001
      ? Math.round((summary.total_paid / summary.total_billed) * 100)
      : summary && summary.total_billed <= 0.001 && summary.total_due < 0.01
        ? 100
        : 0;

  const ListHeader = (
    <View>
      {summary ? (
        <View style={styles.accountCard}>
          <View style={styles.accountHead}>
            <View>
              <Text style={styles.accountOverline}>Account overview</Text>
              <Text style={styles.accountSub}>Bills: {summary.bill_count}</Text>
            </View>
            <View style={styles.healthBadge}>
              <Text style={styles.healthBadgeText}>{healthPct}%</Text>
            </View>
          </View>
          <View style={styles.accountCompactRow}>
            <View style={styles.accountDueBlock}>
              <Text style={styles.accountStatLabel}>Outstanding</Text>
              <Text style={styles.accountAmount}>{formatInrErp(summary.total_due)}</Text>
            </View>
            <View style={styles.walletMini}>
              <Text style={styles.walletStripLabel}>Advance</Text>
              <Text style={styles.walletStripVal}>{formatInrErp(Number(summary.advance_balance || 0))}</Text>
            </View>
          </View>
          <View style={styles.recoveryTrack}>
            <View style={[styles.recoveryFill, { width: `${progressPct}%` }]} />
          </View>
          <View style={styles.accountGrid}>
            <View style={styles.accountMetric}>
              <Text style={styles.accountMetricLabel}>Total billed</Text>
              <Text style={[styles.accountMetricVal, { color: palette.text }]}>
                {formatInrErp(summary.total_billed)}
              </Text>
            </View>
            <View style={styles.accountMetric}>
              <Text style={styles.accountMetricLabel}>Collected</Text>
              <Text style={[styles.accountMetricVal, { color: palette.success }]}>
                {formatInrErp(summary.total_paid)}
              </Text>
            </View>
            <View style={styles.accountMetric}>
              <Text style={styles.accountMetricLabel}>Outstanding</Text>
              <Text style={[styles.accountMetricVal, { color: palette.danger }]}>
                {formatInrErp(summary.total_due)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.statementCard}>
        <View style={styles.statementHead}>
          <View style={styles.statementTitleRow}>
            <FontAwesome name="calendar" size={16} color={palette.primary} />
            <Text style={styles.statementTitle}>Monthly statement</Text>
          </View>
          <View style={styles.statementChips}>
            {monthSettled && rows.length > 0 ? (
              <View style={styles.chipSettled}>
                <Text style={styles.chipSettledText}>Settled</Text>
              </View>
            ) : null}
            <View style={styles.chipCols}>
              <Text style={styles.chipColsText}>{paidBillCount} collected</Text>
            </View>
          </View>
        </View>
        <View style={styles.monthStrip}>
          <Pressable
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
            style={({ pressed }) => [styles.monthFab, pressed && { opacity: 0.75 }]}>
            <FontAwesome name="chevron-left" size={14} color={palette.primary} />
          </Pressable>
          <Text style={styles.monthText}>{monthLabel}</Text>
          <Pressable
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
            style={({ pressed }) => [styles.monthFab, pressed && { opacity: 0.75 }]}>
            <FontAwesome name="chevron-right" size={14} color={palette.primary} />
          </Pressable>
        </View>
        <View style={styles.statementMiniGrid}>
          <View style={styles.statementMiniCell}>
            <Text style={styles.statementRowLabel}>Billed</Text>
            <Text style={[styles.statementRowValue, { color: palette.text }]}>{formatInrErp(monthAgg.billed)}</Text>
          </View>
          <View style={styles.statementMiniCell}>
            <Text style={styles.statementRowLabel}>Paid</Text>
            <Text style={[styles.statementRowValue, { color: palette.success }]}>{formatInrErp(monthAgg.paid)}</Text>
          </View>
          <View style={styles.statementMiniCell}>
            <Text style={styles.statementRowLabel}>Due</Text>
            <Text style={[styles.statementRowValue, { color: palette.danger }]}>{formatInrErp(monthAgg.due)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.listHeaderRow}>
        <Text style={[typography.overline, styles.listSection]}>Bill entries</Text>
        <Text style={styles.listCount}>{rows.length} records</Text>
      </View>
    </View>
  );

  return (
    <ScreenWithBanner>
      <View style={styles.root}>
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color={palette.primary} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            ListHeaderComponent={ListHeader}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            }
            ListEmptyComponent={<Text style={styles.empty}>No line items for this month in the recent list.</Text>}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => {
              const statusMeta = getStatusMeta(item.status);
              const rowTint = index % 2 === 0 ? '#F8FAFF' : '#EEF4FF';
              return (
                <View style={[styles.billRow, { backgroundColor: rowTint }]}>
                  <View style={styles.billTop}>
                    <View style={styles.billTitleCol}>
                      <Text style={styles.billMonth}>{formatMonthDisplay(item.month)}</Text>
                      {item.service_period_label ? (
                        <Text style={styles.billPeriod}>{item.service_period_label}</Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: statusMeta.bg,
                          borderColor: statusMeta.border,
                        },
                      ]}>
                      <Text style={[styles.statusText, { color: statusMeta.fg }]}>{statusMeta.label}</Text>
                    </View>
                  </View>
                  <View style={styles.billCompactAmounts}>
                    <Text style={styles.billCompactText}>
                      Billed <Text style={styles.billStrong}>{formatInrErp(Number(item.amount))}</Text>
                    </Text>
                    <Text style={styles.billCompactText}>
                      Paid <Text style={[styles.billStrong, { color: palette.success }]}>{formatInrErp(item.paid_amount)}</Text>
                    </Text>
                    <Text style={styles.billCompactText}>
                      Due <Text style={[styles.billStrong, { color: palette.danger }]}>{formatInrErp(item.due_amount)}</Text>
                    </Text>
                  </View>
                  {item.paid_at ? <Text style={styles.paidAt}>Cleared {item.paid_at}</Text> : null}
                </View>
              );
            }}
          />
        )}
      </View>
    </ScreenWithBanner>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  loader: { marginTop: 48 },
  list: { paddingHorizontal: layout.space.lg, paddingBottom: layout.space.xxl, paddingTop: layout.space.sm },
  accountCard: {
    backgroundColor: palette.headerBg,
    borderRadius: layout.radius.xl,
    padding: layout.space.lg,
    marginBottom: layout.space.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    ...shadow.md,
  },
  accountHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  accountOverline: { color: 'rgba(255,255,255,0.86)', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  accountSub: { color: 'rgba(219,234,254,0.9)', fontSize: 12, marginTop: 3, fontWeight: '700' },
  healthBadge: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  healthBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  accountAmountRow: { marginTop: layout.space.lg },
  accountCompactRow: { flexDirection: 'row', alignItems: 'stretch', gap: layout.space.sm, marginTop: layout.space.md },
  accountDueBlock: { flex: 1, minWidth: 0 },
  accountStatLabel: { color: 'rgba(191,219,254,0.92)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  accountAmount: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.7, marginTop: 1 },
  recoveryTrack: { height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.24)', marginTop: layout.space.sm, overflow: 'hidden' },
  recoveryFill: { height: '100%', borderRadius: 999, backgroundColor: '#7DD3FC' },
  accountGrid: { flexDirection: 'row', gap: layout.space.sm, marginTop: layout.space.sm },
  accountMetric: {
    flex: 1,
    borderRadius: layout.radius.md,
    padding: 9,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  accountMetricLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: 'rgba(226,232,240,0.95)', textTransform: 'uppercase' },
  accountMetricVal: { marginTop: 4, fontSize: 13, fontWeight: '800', letterSpacing: -0.2, color: '#fff' },
  accountFooter: { marginTop: layout.space.sm, color: 'rgba(191,219,254,0.92)', fontSize: 12, fontWeight: '600', lineHeight: 18 },
  walletMini: {
    minWidth: 104,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: layout.radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  walletStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: layout.space.md,
    paddingVertical: 10,
    paddingHorizontal: layout.space.md,
    borderRadius: layout.radius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  walletStripLabel: { color: 'rgba(226,232,240,0.95)', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  walletStripVal: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  statementCard: { backgroundColor: '#F2F7FF', borderRadius: layout.radius.xl, borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.25)', padding: layout.space.lg, marginBottom: layout.space.md, ...shadow.sm },
  statementHead: { marginBottom: layout.space.sm },
  statementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statementTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: palette.text, textTransform: 'uppercase' },
  statementChips: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 },
  chipSettled: { backgroundColor: palette.mintSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: layout.radius.full },
  chipSettledText: { fontSize: 11, fontWeight: '800', color: palette.success, letterSpacing: 0.3 },
  chipCols: { backgroundColor: palette.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: layout.radius.full },
  chipColsText: { fontSize: 11, fontWeight: '800', color: palette.primary, letterSpacing: 0.3 },
  statementSummary: { marginBottom: layout.space.md },
  statementSummaryLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: palette.textMuted, textTransform: 'uppercase' },
  statementSummaryAmt: { fontSize: 26, fontWeight: '800', color: palette.primaryDark, letterSpacing: -0.5, marginTop: 4 },
  monthStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: layout.space.lg, marginBottom: layout.space.sm },
  monthFab: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(37, 99, 235, 0.2)' },
  monthText: { fontSize: 16, fontWeight: '800', color: palette.text, letterSpacing: -0.3, minWidth: 116, textAlign: 'center' },
  statementMiniGrid: { flexDirection: 'row', gap: layout.space.sm },
  statementMiniCell: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: layout.radius.md,
    backgroundColor: '#F5F9FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
  },
  statementTable: {
    backgroundColor: '#EAF2FF',
    borderRadius: layout.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  statementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: layout.space.md,
    paddingHorizontal: layout.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSubtle,
    backgroundColor: '#F5F9FF',
  },
  statementRowLast: { borderBottomWidth: 0 },
  statementRowLabel: { fontSize: 12, fontWeight: '700', color: palette.textMuted, letterSpacing: 0.2 },
  statementRowValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listSection: { marginTop: 2, marginBottom: layout.space.sm, marginLeft: 4 },
  listCount: { fontSize: 12, color: palette.textMuted, fontWeight: '700' },
  billRow: {
    borderRadius: layout.radius.md,
    padding: 12,
    marginBottom: layout.space.sm,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.sm,
  },
  billTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: layout.space.sm },
  billTitleCol: { flex: 1, minWidth: 0 },
  billMonth: { fontWeight: '800', color: palette.text, fontSize: 14 },
  billPeriod: { marginTop: 3, fontSize: 11, fontWeight: '600', color: palette.textMuted },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
  billAmounts: { marginTop: layout.space.md, flexDirection: 'row', gap: layout.space.sm },
  billAmountCell: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
    borderRadius: layout.radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: palette.surfaceMuted,
  },
  billMetaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  billTotal: { marginTop: 4, fontSize: 16, fontWeight: '800', color: palette.text, letterSpacing: -0.2 },
  billMetaValue: { marginTop: 4, fontSize: 15, fontWeight: '800' },
  billCompactAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  billCompactText: { fontSize: 12, fontWeight: '700', color: palette.textMuted },
  billStrong: { color: palette.text, fontWeight: '900' },
  paidAt: { marginTop: 6, fontSize: 11, color: palette.textMuted, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 8, marginBottom: 24, color: palette.textMuted, fontSize: 14 },
});
