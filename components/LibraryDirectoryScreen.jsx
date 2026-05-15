import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { layout, palette, shadow } from '@/constants/Theme';
import { useAuth } from '@/context/AuthContext';
import { publicLibraryDirectory, studentLibraryDirectory } from '@/lib/api/studentApi';
import { getApiBaseUrl } from '@/lib/config';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AMENITY_LABELS = {
  wifi: 'Wi-Fi',
  ac: 'AC',
  parking: 'Parking',
  power_backup: 'Power backup',
  drinking_water: 'Water',
  locker: 'Locker',
  cctv: 'Security',
  separate_girls_section: 'Girls section',
};

const PAGE_SIZE = 10;
const MAX_RESULTS = 50;

function resolveMediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${getApiBaseUrl().replace(/\/api\/?$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function feeLine(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `From Rs.${Number(value).toLocaleString('en-IN')}/month`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function distanceKm(from, row) {
  if (!from) return null;
  const lat2 = toNumber(row.latitude);
  const lon2 = toNumber(row.longitude);
  if (lat2 == null || lon2 == null) return null;
  const toRad = (v) => (v * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - from.latitude);
  const dLon = toRad(lon2 - from.longitude);
  const lat1 = toRad(from.latitude);
  const latB = toRad(lat2);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceLabel(km) {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km away`;
}

function rowSearchText(row) {
  return [
    row.name,
    row.listing_area,
    row.city,
    row.district,
    row.state,
    row.pincode,
    row.listing_address,
    row.address,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function LibraryDirectoryScreen({ publicMode = false }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [searchText, setSearchText] = useState('');
  const [rows, setRows] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [activeQuery, setActiveQuery] = useState('');
  const [activeForceAll, setActiveForceAll] = useState(false);
  const [resultLimit, setResultLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const canUseLoggedEndpoint = !publicMode && !!token;

  const load = useCallback(async (qText = '', options = {}) => {
    const showResults = options.showResults !== false;
    const forceAll = options.forceAll === true;
    const limit = Math.min(Number(options.limit || PAGE_SIZE) || PAGE_SIZE, MAX_RESULTS);
    if (showResults) {
      setError(null);
      setLoading(true);
    }
    try {
      const q = String(qText || '').trim();
      const params = { limit, ...(q && !forceAll ? { q, search: q } : {}) };
      const data = canUseLoggedEndpoint
        ? await studentLibraryDirectory(token, params)
        : await publicLibraryDirectory(params);
      setRows(data.rows || []);
      if (showResults) {
        setActiveQuery(forceAll ? '' : q);
        setActiveForceAll(forceAll);
        setResultLimit(limit);
        setHasSearched(true);
      }
    } catch (e) {
      if (showResults) {
        setRows([]);
        setError(e?.message || 'Unable to load libraries.');
      }
    } finally {
      if (showResults) setLoading(false);
    }
  }, [canUseLoggedEndpoint, token]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      if (hasSearched) {
        await load(activeQuery, { showResults: true, forceAll: activeForceAll, limit: resultLimit });
      } else {
        await load('', { showResults: false, forceAll: true, limit: PAGE_SIZE });
      }
    } finally {
      setRefreshing(false);
    }
  }

  const displayRows = useMemo(() => {
    const q = activeQuery.trim().toLowerCase();
    const filtered = q ? rows.filter((row) => rowSearchText(row).includes(q)) : rows;
    return filtered
      .map((row) => ({ ...row, distance_km: distanceKm(userLocation, row) }))
      .sort((a, b) => {
        if (!userLocation) return 0;
        if (a.distance_km == null && b.distance_km == null) return 0;
        if (a.distance_km == null) return 1;
        if (b.distance_km == null) return -1;
        return a.distance_km - b.distance_km;
      });
  }, [activeQuery, rows, userLocation]);

  function submitSearch(qText = searchText) {
    const q = String(qText || '').trim();
    setSearchText(q);
    if (!q) {
      setHasSearched(false);
      setActiveQuery('');
      setActiveForceAll(false);
      setLocationMessage('Enter an address, city, or pincode, or use your location.');
      return;
    }
    setLocationMessage('');
    void load(q, { showResults: true, limit: PAGE_SIZE });
  }

  async function useMyLocation() {
    setLocationBusy(true);
    setLocationMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Allow location permission to see nearest libraries.');
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setSearchText('');
      await load('', { showResults: true, forceAll: true, limit: PAGE_SIZE });
      setLocationMessage('Nearest libraries are sorted first.');
    } catch (err) {
      setLocationMessage(err?.message || 'Location is not available on this device.');
    } finally {
      setLocationBusy(false);
    }
  }

  function openDetails(row) {
    router.push({
      pathname: '/library-detail',
      params: { library: encodeURIComponent(JSON.stringify(row)) },
    });
  }

  async function loadMore(all = false) {
    if (loadingMore || loading) return;
    const nextLimit = all ? MAX_RESULTS : Math.min(resultLimit + PAGE_SIZE, MAX_RESULTS);
    if (nextLimit <= resultLimit) return;
    setLoadingMore(true);
    try {
      await load(activeQuery, {
        showResults: false,
        forceAll: activeForceAll,
        limit: nextLimit,
      });
      setResultLimit(nextLimit);
    } finally {
      setLoadingMore(false);
    }
  }

  const canLoadMore = hasSearched && !loading && !error && rows.length >= resultLimit && resultLimit < MAX_RESULTS;

  const body = (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} colors={[palette.primary]} />}>
      {/* <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <FontAwesome name="map-marker" size={22} color={palette.primary} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>Library discovery</Text>
          <Text style={styles.title}>Find libraries near your area</Text>
          <Text style={styles.subtitle}>
            Enter an area, city, pincode, or library name. Use distance when you want the nearest options first.
          </Text>
        </View>
      </View> */}

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <TextInput
              style={styles.input}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Enter area, city, pincode, or library"
              placeholderTextColor={palette.textHint}
              returnKeyType="search"
              onSubmitEditing={() => submitSearch()}
            />
          </View>
          <Pressable style={[styles.searchBtn, loading && styles.searchBtnDisabled]} onPress={() => submitSearch()} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <FontAwesome name="search" size={15} color="#fff" />}
            <Text style={styles.searchText}>{loading ? 'Searching' : 'Search'}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.locationBtn} onPress={useMyLocation} disabled={locationBusy}>
          {locationBusy ? <ActivityIndicator size="small" color={palette.primary} /> : <FontAwesome name="location-arrow" size={15} color={palette.primary} />}
          <Text style={styles.locationText}>{locationBusy ? 'Calculating distance...' : 'Calculate distance / nearest'}</Text>
        </Pressable>
        {locationMessage ? <Text style={styles.locationHint}>{locationMessage}</Text> : null}
      </View>

      {!hasSearched ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>Search a location</Text>
          <Text style={styles.emptySub}>Enter an address, city, or pincode, or sort by your current location.</Text>
        </View>
      ) : loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : displayRows.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>No library found</Text>
          <Text style={styles.emptySub}>No library is available for this area yet.</Text>
        </View>
      ) : (
        <>
        {displayRows.map((row) => {
          const logoUri = resolveMediaUrl(row.logo_url);
          const dist = distanceLabel(row.distance_km);
          return (
          <View key={row.id} style={styles.card}>
            <Pressable style={styles.cardTop} onPress={() => openDetails(row)}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.cardLogoImg} contentFit="cover" transition={120} />
              ) : (
              <View style={styles.logo}>
                <FontAwesome name="university" size={20} color={palette.primary} />
              </View>
              )}
              <View style={styles.cardMain}>
                <Text style={styles.cardTitle}>{row.name}</Text>
                <Text style={styles.cardMeta} numberOfLines={2}>
                  {[row.listing_area, row.city, row.pincode].filter(Boolean).join(' - ') || row.address || 'Address not set'}
                </Text>
              </View>
              {dist ? <Text style={styles.distanceBadge}>{dist}</Text> : null}
            </Pressable>
            {row.listing_description ? <Text style={styles.desc} numberOfLines={3}>{row.listing_description}</Text> : null}
            <View style={styles.metaRow}>
              {feeLine(row.monthly_fee_min) ? <Text style={styles.pillPrimary}>{feeLine(row.monthly_fee_min)}</Text> : null}
              {row.seat_capacity ? <Text style={styles.pill}>{row.seat_capacity} seats</Text> : null}
              
            </View>
            {Array.isArray(row.amenities) && row.amenities.length ? (
              <View style={styles.metaRow}>
                {row.amenities.slice(0, 4).map((id) => (
                  <Text key={id} style={styles.softPill}>{AMENITY_LABELS[id] || id}</Text>
                ))}
              </View>
            ) : null}
            <Text style={styles.address} numberOfLines={2}>{row.address}</Text>
            {row.public_email ? (
              <Pressable style={styles.emailRow} onPress={() => Linking.openURL(`mailto:${row.public_email}`)}>
                <FontAwesome name="envelope" size={14} color={palette.primary} style={styles.emailIcon} />
                <Text style={styles.emailText} numberOfLines={1}>{row.public_email}</Text>
              </Pressable>
            ) : null}
            <View style={styles.actions}>
              <Pressable style={styles.actionBtnPrimary} onPress={() => openDetails(row)}>
                <FontAwesome name="info-circle" size={14} color="#fff" />
                <Text style={styles.actionTextPrimary}>View details</Text>
              </Pressable>
              {row.contact_phone ? (
                <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${row.contact_phone}`)}>
                  <FontAwesome name="phone" size={14} color={palette.primary} />
                  <Text style={styles.actionText}>Call</Text>
                </Pressable>
              ) : null}
              {row.contact_whatsapp ? (
                <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(`https://wa.me/${String(row.contact_whatsapp).replace(/\D/g, '')}`)}>
                  <FontAwesome name="whatsapp" size={14} color={palette.primary} />
                  <Text style={styles.actionText}>WhatsApp</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          );
        })}
        {canLoadMore ? (
          <View style={styles.paginationRow}>
            <Pressable style={[styles.loadMoreBtn, loadingMore && styles.searchBtnDisabled]} onPress={() => void loadMore(false)} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator size="small" color={palette.primary} /> : <FontAwesome name="plus" size={14} color={palette.primary} />}
              <Text style={styles.loadMoreText}>{loadingMore ? 'Loading more...' : 'Load more'}</Text>
            </Pressable>
            <Pressable style={[styles.loadAllBtn, loadingMore && styles.searchBtnDisabled]} onPress={() => void loadMore(true)} disabled={loadingMore}>
              <Text style={styles.loadAllText}>Load all</Text>
            </Pressable>
          </View>
        ) : null}
        </>
      )}
    </ScrollView>
  );

  return publicMode ? <View style={styles.publicRoot}>{body}</View> : <ScreenWithBanner>{body}</ScreenWithBanner>;
}

const styles = StyleSheet.create({
  publicRoot: { flex: 1, backgroundColor: palette.canvas },
  container: { padding: layout.space.lg, backgroundColor: palette.canvas },
  hero: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: layout.space.lg },
  heroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  heroCopy: { flex: 1 },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: palette.primary, textTransform: 'uppercase' },
  title: { marginTop: 4, fontSize: 24, fontWeight: '900', color: palette.primaryDark, letterSpacing: -0.6 },
  subtitle: { marginTop: 6, fontSize: 14, lineHeight: 20, color: palette.textSecondary },
  searchCard: { backgroundColor: palette.surface, borderRadius: layout.radius.xl, padding: layout.space.lg, marginBottom: layout.space.md, ...shadow.sm },
  input: { minHeight: 46, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.md, paddingHorizontal: 12, color: palette.text, backgroundColor: '#fff', marginBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  searchInputWrap: { flex: 1, minWidth: 0 },
  searchBtn: { minHeight: 46, minWidth: 104, borderRadius: layout.radius.md, backgroundColor: palette.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  searchBtnDisabled: { opacity: 0.72 },
  searchText: { color: '#fff', fontWeight: '800' },
  locationBtn: { minHeight: 42, marginTop: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.md, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  locationText: { color: palette.primary, fontWeight: '800', fontSize: 13 },
  locationHint: { marginTop: 8, color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  centerBox: { minHeight: 140, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: palette.danger, fontWeight: '700' },
  emptyTitle: { color: palette.text, fontWeight: '800', fontSize: 16 },
  emptySub: { marginTop: 4, color: palette.textSecondary },
  card: { backgroundColor: palette.surface, borderRadius: layout.radius.xl, padding: layout.space.lg, marginBottom: layout.space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.borderSubtle, ...shadow.sm },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.borderSubtle },
  logo: { width: 56, height: 56, borderRadius: 18, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardLogoImg: { width: 56, height: 56, borderRadius: 18, backgroundColor: palette.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  cardMain: { flex: 1, minWidth: 0 },
  distanceBadge: { alignSelf: 'flex-start', backgroundColor: '#f0fdf4', color: '#047857', borderRadius: layout.radius.full, paddingHorizontal: 9, paddingVertical: 6, fontSize: 11, fontWeight: '900' },
  cardTitle: { fontSize: 17, fontWeight: '900', color: palette.text },
  cardMeta: { marginTop: 4, fontSize: 13, color: palette.textSecondary, lineHeight: 18 },
  desc: { marginTop: 12, fontSize: 14, color: palette.textSecondary, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pillPrimary: { backgroundColor: palette.primary, color: '#fff', borderRadius: layout.radius.full, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, fontWeight: '900' },
  pill: { backgroundColor: '#eef2ff', color: '#3730a3', borderRadius: layout.radius.full, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, fontWeight: '800' },
  softPill: { backgroundColor: '#ecfdf5', color: '#047857', borderRadius: layout.radius.full, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, fontWeight: '800' },
  address: { marginTop: 12, color: palette.textMuted, fontSize: 13, lineHeight: 18 },
  emailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  emailIcon: { marginRight: 8 },
  emailText: { flex: 1, color: palette.primary, fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: palette.primary, borderRadius: layout.radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  actionTextPrimary: { color: '#fff', fontWeight: '900' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  actionText: { color: palette.primary, fontWeight: '800' },
  paginationRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: layout.space.md },
  loadMoreBtn: { flex: 1, minHeight: 44, borderRadius: layout.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadMoreText: { color: palette.primary, fontWeight: '900' },
  loadAllBtn: { minHeight: 44, borderRadius: layout.radius.md, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  loadAllText: { color: palette.primaryDark, fontWeight: '900' },
});
