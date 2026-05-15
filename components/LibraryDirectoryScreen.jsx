import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { layout, palette, shadow } from '@/constants/Theme';
import { useAuth } from '@/context/AuthContext';
import { publicLibraryDirectory, studentLibraryDirectory } from '@/lib/api/studentApi';
import { getApiBaseUrl } from '@/lib/config';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function uniq(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function SelectBox({ label, value, placeholder, options, onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.selectWrap}>
      <Text style={styles.selectLabel}>{label}</Text>
      <Pressable style={styles.selectButton} onPress={() => setOpen((v) => !v)}>
        <Text style={[styles.selectValue, !value && styles.selectPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <FontAwesome name={open ? 'angle-up' : 'angle-down'} size={16} color={palette.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.selectMenu}>
          <Pressable style={styles.selectOption} onPress={() => { onSelect(''); setOpen(false); }}>
            <Text style={styles.selectOptionText}>Any</Text>
          </Pressable>
          {options.map((option) => (
            <Pressable key={option} style={styles.selectOption} onPress={() => { onSelect(option); setOpen(false); }}>
              <Text style={styles.selectOptionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function resolveMediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${getApiBaseUrl().replace(/\/api\/?$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function feeLine(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `From Rs.${Number(value).toLocaleString('en-IN')}/month`;
}

function findPincodeLocation(locations, pincode, city = '', area = '') {
  const pin = String(pincode || '').trim();
  if (!/^\d{6}$/.test(pin)) return null;
  return locations.find((item) => item.pincode === pin && (!city || item.city === city) && (!area || item.area === area))
    || locations.find((item) => item.pincode === pin && (!city || item.city === city))
    || locations.find((item) => item.pincode === pin)
    || null;
}

export function LibraryDirectoryScreen({ publicMode = false }) {
  const insets = useSafeAreaInsets();
  const { token, student } = useAuth();
  const [filters, setFilters] = useState({
    q: '',
    state: student?.state || 'Bihar',
    area: '',
    city: student?.city || '',
    district: '',
    pincode: student?.pincode || '',
  });
  const [searchText, setSearchText] = useState('');
  const [rows, setRows] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const canUseLoggedEndpoint = !publicMode && !!token;

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = canUseLoggedEndpoint
        ? await studentLibraryDirectory(token, filters)
        : await publicLibraryDirectory(filters);
      setRows(data.rows || []);
      setAreas(data.areas || []);
    } catch (e) {
      setRows([]);
      setError(e?.message || 'Unable to load libraries.');
    } finally {
      setLoading(false);
    }
  }, [canUseLoggedEndpoint, token, filters]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const popularAreas = useMemo(() => areas.slice(0, 8), [areas]);
  const allLocations = useMemo(() => {
    const fromApi = areas.map((item) => ({
      state: item.state || 'Bihar',
      city: item.city || '',
      district: item.district || '',
      area: item.listing_area || '',
      pincode: item.pincode || '',
    }));
    return fromApi;
  }, [areas]);
  const stateOptions = useMemo(() => uniq(['Bihar', ...allLocations.map((item) => item.state)]), [allLocations]);
  const districtOptions = useMemo(
    () => uniq(allLocations.filter((item) => !filters.state || item.state === filters.state).map((item) => item.district)),
    [allLocations, filters.state],
  );
  const cityOptions = useMemo(
    () => uniq(allLocations.filter((item) => (!filters.state || item.state === filters.state) && (!filters.district || item.district === filters.district)).map((item) => item.city)),
    [allLocations, filters.district, filters.state],
  );
  const pincodeOptions = useMemo(
    () =>
      uniq(
        allLocations
          .filter(
            (item) =>
              (!filters.state || item.state === filters.state) &&
              (!filters.city || item.city === filters.city) &&
              (!filters.area || item.area === filters.area),
          )
          .map((item) => item.pincode)
          .filter((pin) => /^\d{6}$/.test(String(pin || '').trim())),
      ),
    [allLocations, filters.area, filters.city, filters.state],
  );

  const villagesInSelectedCity = useMemo(() => {
    const st = filters.state || 'Bihar';
    const city = String(filters.city || '').trim();
    if (!city || st !== 'Bihar') return [];
    return allLocations.filter((r) => r.city === city).map((r) => r.area);
  }, [allLocations, filters.city, filters.state]);

  const areaSuggestions = useMemo(() => {
    const q = String(filters.area || '').trim().toLowerCase();
    if (q.length < 2 || !villagesInSelectedCity.length) return [];
    const out = [];
    for (const a of villagesInSelectedCity) {
      if (a.toLowerCase().includes(q)) {
        out.push(a);
        if (out.length >= 16) break;
      }
    }
    return out;
  }, [filters.area, villagesInSelectedCity]);

  function chooseLocationPatch(patch) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function applyPincode(pincodeText) {
    const pincode = String(pincodeText || '').replace(/\D/g, '').slice(0, 6);
    setFilters((f) => {
      const match = findPincodeLocation(allLocations, pincode, f.city, f.area);
      if (!match) return { ...f, pincode };
      return {
        ...f,
        pincode,
        state: match.state || f.state || 'Bihar',
        city: match.city || f.city,
        area: match.area || f.area,
      };
    });
  }

  const body = (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} colors={[palette.primary]} />}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <FontAwesome name="map-marker" size={22} color={palette.primary} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>Library discovery</Text>
          <Text style={styles.title}>Find libraries near your area</Text>
          <Text style={styles.subtitle}>
            {canUseLoggedEndpoint ? 'Use your saved address or search any city, area, or pincode.' : 'Search public libraries before signing in.'}
          </Text>
        </View>
      </View>

      <View style={styles.searchCard}>
        <TextInput
          style={styles.input}
          value={searchText}
          onChangeText={(q) => {
            setSearchText(q);
            setFilters((f) => ({ ...f, q }));
          }}
          placeholder="Search library, area, address, or pincode"
          placeholderTextColor={palette.textHint}
          returnKeyType="search"
          onSubmitEditing={() => void load()}
        />
        <View style={styles.dropdownGrid}>
          <SelectBox label="State" value={filters.state} placeholder="Select state" options={stateOptions} onSelect={(state) => chooseLocationPatch({ state, district: '', city: '', area: '', pincode: '' })} />
          <SelectBox label="District" value={filters.district} placeholder="Select district" options={districtOptions} onSelect={(district) => chooseLocationPatch({ district, city: '', area: '', pincode: '' })} />
          <SelectBox label="City" value={filters.city} placeholder="Select city" options={cityOptions} onSelect={(city) => chooseLocationPatch({ city, area: '', pincode: '' })} />
          <View style={styles.selectWrap}>
            <Text style={styles.selectLabel}>Local area</Text>
            <TextInput
              style={styles.input}
              value={filters.area}
              onChangeText={(area) => chooseLocationPatch({ area })}
              placeholder="Village / locality (optional)"
              placeholderTextColor={palette.textHint}
            />
            {areaSuggestions.length ? (
              <View style={styles.suggestBox}>
                {areaSuggestions.map((a) => (
                  <Pressable
                    key={a}
                    style={styles.suggestRow}
                    onPress={() => {
                      chooseLocationPatch({ area: a });
                    }}>
                    <Text style={styles.suggestText}>{a}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <SelectBox label="Pincode" value={filters.pincode} placeholder="Select pincode" options={pincodeOptions} onSelect={(pincode) => {
            const match = findPincodeLocation(allLocations, pincode, filters.city, filters.area);
            chooseLocationPatch({
              pincode,
              state: match?.state || filters.state || 'Bihar',
              city: match?.city || filters.city,
              area: match?.area || filters.area,
            });
          }} />
        </View>
        <View style={styles.twoCols}>
          <TextInput style={[styles.input, styles.flex]} value={filters.pincode} onChangeText={applyPincode} placeholder="Or type pincode" keyboardType="number-pad" placeholderTextColor={palette.textHint} maxLength={6} />
          <Pressable style={styles.searchBtn} onPress={() => void load()}>
            <FontAwesome name="search" size={15} color="#fff" />
            <Text style={styles.searchText}>Search</Text>
          </Pressable>
        </View>
      </View>

      {popularAreas.length ? (
        <View style={styles.areaWrap}>
          {popularAreas.map((item) => (
            <Pressable key={`${item.state}-${item.city}-${item.listing_area}-${item.pincode}`} style={styles.areaChip} onPress={() => setFilters((f) => ({ ...f, state: item.state || 'Bihar', district: item.district || f.district, area: item.listing_area || '', city: item.city || f.city, pincode: item.pincode || '' }))}>
              <Text style={styles.areaChipText}>{item.listing_area || 'Area'}{item.city ? `, ${item.city}` : ''}{item.pincode ? ` - ${item.pincode}` : ''}</Text>
              <Text style={styles.areaChipCount}>{item.total}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>No libraries found</Text>
          <Text style={styles.emptySub}>Try a nearby area, city, or pincode.</Text>
        </View>
      ) : (
        rows.map((row) => {
          const logoUri = resolveMediaUrl(row.logo_url);
          return (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardTop}>
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
            </View>
            {row.listing_description ? <Text style={styles.desc} numberOfLines={3}>{row.listing_description}</Text> : null}
            <View style={styles.metaRow}>
              {feeLine(row.monthly_fee_min) ? <Text style={styles.pill}>{feeLine(row.monthly_fee_min)}</Text> : null}
              {row.seat_capacity ? <Text style={styles.pill}>{row.seat_capacity} seats</Text> : null}
              {row.active_students_count != null && row.active_students_count > 0 ? (
                <Text style={styles.pill}>{row.active_students_count} students</Text>
              ) : null}
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
        })
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
  dropdownGrid: { gap: 10, marginBottom: 10 },
  suggestBox: { marginTop: 4, marginBottom: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.md, backgroundColor: '#fff', overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.borderSubtle },
  suggestText: { flex: 1, color: palette.text, fontWeight: '600', fontSize: 13 },
  selectWrap: { position: 'relative', zIndex: 1 },
  selectLabel: { marginBottom: 6, color: palette.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  selectButton: { minHeight: 46, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.md, paddingHorizontal: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selectValue: { flex: 1, color: palette.text, fontWeight: '700' },
  selectPlaceholder: { color: palette.textHint, fontWeight: '500' },
  selectMenu: { marginTop: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.md, backgroundColor: '#fff', overflow: 'hidden' },
  selectOption: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.borderSubtle },
  selectOptionText: { color: palette.text, fontWeight: '700' },
  twoCols: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  searchBtn: { minHeight: 46, flex: 1, borderRadius: layout.radius.md, backgroundColor: palette.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  searchText: { color: '#fff', fontWeight: '800' },
  areaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: layout.space.md },
  areaChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.primarySoft, borderRadius: layout.radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  areaChipText: { color: palette.primaryDark, fontWeight: '700', fontSize: 12 },
  areaChipCount: { color: palette.primary, fontWeight: '900', fontSize: 12 },
  centerBox: { minHeight: 140, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: palette.danger, fontWeight: '700' },
  emptyTitle: { color: palette.text, fontWeight: '800', fontSize: 16 },
  emptySub: { marginTop: 4, color: palette.textSecondary },
  card: { backgroundColor: palette.surface, borderRadius: layout.radius.xl, padding: layout.space.lg, marginBottom: layout.space.md, ...shadow.sm },
  cardTop: { flexDirection: 'row', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardLogoImg: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  cardMain: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: palette.text },
  cardMeta: { marginTop: 4, fontSize: 13, color: palette.textSecondary, lineHeight: 18 },
  desc: { marginTop: 12, fontSize: 14, color: palette.textSecondary, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill: { backgroundColor: '#eef2ff', color: '#3730a3', borderRadius: layout.radius.full, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, fontWeight: '800' },
  softPill: { backgroundColor: '#ecfdf5', color: '#047857', borderRadius: layout.radius.full, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, fontWeight: '800' },
  address: { marginTop: 12, color: palette.textMuted, fontSize: 13, lineHeight: 18 },
  emailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  emailIcon: { marginRight: 8 },
  emailText: { flex: 1, color: palette.primary, fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: layout.radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  actionText: { color: palette.primary, fontWeight: '800' },
});
