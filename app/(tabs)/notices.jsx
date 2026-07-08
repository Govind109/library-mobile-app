import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { studentMarkNoticeRead, studentNotices } from '@/lib/api/studentApi';
import { cardFlat, layout, palette, primaryButton, primaryButtonText, typography } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function formatNoticeTime(value) {
  if (!value) return 'Recently';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NoticesScreen() {
  const { token, refreshMe } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(null);

  const loadPage = useCallback(
    async (p, append) => {
      if (!token) return;
      const data = await studentNotices(token, p);
      setUnread(data.unread_count);
      setLastPage(data.meta.last_page);
      if (append) {
        setRows((prev) => [...prev, ...data.rows]);
      } else {
        setRows(data.rows);
      }
      setPage(p);
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          try {
            await refreshMe();
          } catch {
            // Keep the last notice list when profile refresh fails.
          }
          if (!cancelled) {
            await loadPage(1, false);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadPage, refreshMe]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPage(1, false);
    } finally {
      setRefreshing(false);
    }
  }, [loadPage]);

  async function openNotice(n) {
    setSelected(n);
    if (!token || n.read_at) return;
    try {
      await studentMarkNoticeRead(token, n.id);
      setRows((prev) =>
        prev.map((r) =>
          r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* still show notice */
    }
  }

  async function loadMore() {
    if (rows.length === 0 || page >= lastPage || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(page + 1, true);
    } finally {
      setLoadingMore(false);
    }
  }

  const readCount = Math.max(0, rows.length - unread);

  return (
    <ScreenWithBanner>
      <View style={styles.root}>
        <View style={styles.heroWrap}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroKicker}>Notice center</Text>
              <Text style={styles.heroTitle}>Updates from library</Text>
              <Text style={styles.heroSub}>
                {rows.length} total · {readCount} read · {unread} unread
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{unread} new</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color={palette.primary} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            }
            onEndReachedThreshold={0.4}
            onEndReached={() => void loadMore()}
            ListEmptyComponent={<Text style={styles.empty}>You have no notices yet.</Text>}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  cardFlat(),
                  styles.card,
                  !item.read_at && styles.cardUnread,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => void openNotice(item)}>
                <View style={styles.cardTop}>
                  <View style={[styles.noticeIcon, !item.read_at && styles.noticeIconUnread]}>
                    <FontAwesome name={item.read_at ? 'check' : 'bell'} size={12} color={item.read_at ? palette.success : palette.primary} />
                  </View>
                  <View style={styles.cardHeadLeft}>
                    <Text style={styles.title} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.sentChip}>{formatNoticeTime(item.sent_at)}</Text>
                  </View>
                  {!item.read_at ? <View style={styles.dot} /> : null}
                </View>
                <Text style={[typography.body, styles.preview]} numberOfLines={2}>
                  {item.message}
                </Text>
              </Pressable>
            )}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={palette.primary} />
              ) : null
            }
          />
        )}

        <Modal visible={selected !== null} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selected?.title}</Text>
                <Pressable onPress={() => setSelected(null)} hitSlop={12} style={styles.closeHit}>
                  <FontAwesome name="close" size={20} color={palette.textMuted} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalBody}>
                <View style={styles.modalMeta}>
                  <FontAwesome name="calendar-o" size={14} color={palette.primary} />
                  <Text style={styles.modalMetaText}>{formatNoticeTime(selected?.sent_at)}</Text>
                </View>
                <Text style={[typography.body, styles.modalMsg]}>{selected?.message}</Text>
              </ScrollView>
              <Pressable
                style={[primaryButton(), styles.modalClose]}
                onPress={() => setSelected(null)}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
                <Text style={primaryButtonText()}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </ScreenWithBanner>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  heroWrap: { paddingHorizontal: layout.space.lg, paddingTop: layout.space.sm, paddingBottom: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: layout.space.md },
  heroKicker: { color: palette.textMuted, fontWeight: '700', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: palette.text, fontWeight: '800', fontSize: 20, letterSpacing: -0.4, marginTop: 1 },
  heroSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: palette.textMuted },
  heroBadge: { backgroundColor: palette.primary, borderRadius: layout.radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  heroBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.2 },
  heroStats: { marginTop: layout.space.md, flexDirection: 'row', gap: layout.space.sm },
  heroStatItem: { flex: 1, borderRadius: layout.radius.md, paddingVertical: 10, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.borderSubtle },
  heroStatLabel: { color: palette.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroStatValue: { marginTop: 2, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  banner: { marginTop: layout.space.md, backgroundColor: palette.primary, paddingVertical: 10, paddingHorizontal: layout.space.lg, borderRadius: layout.radius.md },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.2, textAlign: 'center' },
  bannerCalm: { backgroundColor: palette.successSoft },
  bannerTextCalm: { color: palette.success, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  loader: { marginTop: 48 },
  list: { paddingHorizontal: layout.space.lg, paddingBottom: layout.space.xxl, paddingTop: layout.space.sm },
  card: { padding: 12, marginBottom: layout.space.sm, overflow: 'hidden' },
  cardUnread: { borderColor: 'rgba(37, 99, 235, 0.25)', backgroundColor: palette.primarySoft },
  cardPressed: { opacity: 0.92 },
  accentRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: palette.primary },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeadLeft: { flex: 1, minWidth: 0 },
  noticeIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.mintSoft,
  },
  noticeIconUnread: { backgroundColor: palette.primarySoft },
  title: { flex: 1, fontSize: 14, fontWeight: '800', letterSpacing: -0.1, color: palette.text, lineHeight: 19 },
  sentChip: {
    alignSelf: 'flex-start',
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: palette.textMuted,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.primary },
  preview: { marginTop: 7, fontSize: 12, lineHeight: 17, color: palette.textSecondary },
  tapHint: { marginTop: layout.space.sm, fontSize: 12, color: palette.textMuted, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 48, ...typography.body, color: palette.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: palette.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingBottom: layout.space.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: layout.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: palette.text, paddingRight: layout.space.lg, lineHeight: 24 },
  closeHit: { padding: 4 },
  modalBody: { paddingHorizontal: layout.space.lg, maxHeight: 420 },
  modalMeta: { marginTop: layout.space.md, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalMetaText: { fontSize: 12, color: palette.primaryDark, fontWeight: '700' },
  modalMsg: { paddingVertical: layout.space.lg },
  modalClose: { marginHorizontal: layout.space.lg, marginTop: layout.space.sm },
});
