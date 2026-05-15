import { layout, palette, shadow } from '@/constants/Theme';
import { getApiBaseUrl } from '@/lib/config';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

function resolveMediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${getApiBaseUrl().replace(/\/api\/?$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function feeLine(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `Rs.${Number(value).toLocaleString('en-IN')}/month`;
}

function parseLibraryParam(value) {
  try {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw ? JSON.parse(decodeURIComponent(raw)) : null;
  } catch {
    return null;
  }
}

function mapUrlFor(row, address) {
  const lat = Number(row?.latitude);
  const lng = Number(row?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(row.name || 'Library')})`;
  }
  return `geo:0,0?q=${encodeURIComponent(address || row?.name || 'Library')}`;
}

function enquiryUrlFor(row) {
  const message = `Hi, I want to enquire about ${row.name || 'your library'}.`;
  const whatsapp = String(row.contact_whatsapp || '').replace(/\D/g, '');
  if (whatsapp) return `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
  if (row.public_email) return `mailto:${row.public_email}?subject=${encodeURIComponent('Library enquiry')}&body=${encodeURIComponent(message)}`;
  if (row.contact_phone) return `sms:${String(row.contact_phone).replace(/\s/g, '')}?body=${encodeURIComponent(message)}`;
  return null;
}

export default function LibraryDetailPage() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const row = parseLibraryParam(params.library);
  const logoUri = resolveMediaUrl(row?.logo_url);
  const areaLine = [row?.listing_area, row?.city, row?.pincode].filter(Boolean).join(' - ');
  const address = row?.listing_address || row?.address || 'Address not set';
  const enquiryUrl = row ? enquiryUrlFor(row) : null;

  if (!row) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Library details unavailable</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}>
      <View style={styles.hero}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={styles.logoImg} contentFit="cover" transition={120} />
        ) : (
          <View style={styles.logoFallback}>
            <FontAwesome name="university" size={34} color={palette.primary} />
          </View>
        )}
        <View style={styles.heroText}>
          <Text style={styles.name}>{row.name}</Text>
          <Text style={styles.area}>{areaLine || 'Location not set'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Overview</Text>
        {row.listing_description ? <Text style={styles.desc}>{row.listing_description}</Text> : null}
        <View style={styles.metricRow}>
          {feeLine(row.monthly_fee_min) ? <Text style={styles.metricPrimary}>{feeLine(row.monthly_fee_min)}</Text> : null}
          {row.seat_capacity ? <Text style={styles.metric}>{row.seat_capacity} seats</Text> : null}
          {row.active_students_count ? <Text style={styles.metric}>{row.active_students_count} students</Text> : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Address</Text>
        <Text style={styles.address}>{address}</Text>
        {[row.city, row.district, row.state, row.pincode].filter(Boolean).length ? (
          <Text style={styles.muted}>{[row.city, row.district, row.state, row.pincode].filter(Boolean).join(', ')}</Text>
        ) : null}
      </View>

      {Array.isArray(row.amenities) && row.amenities.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Facilities</Text>
          <View style={styles.chips}>
            {row.amenities.map((id) => (
              <Text key={id} style={styles.chip}>{AMENITY_LABELS[id] || id}</Text>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(mapUrlFor(row, address))}>
          <FontAwesome name="map-marker" size={15} color="#fff" />
          <Text style={styles.actionText}>View location on map</Text>
        </Pressable>
        {enquiryUrl ? (
          <Pressable style={styles.actionBtnSecondary} onPress={() => Linking.openURL(enquiryUrl)}>
            <FontAwesome name="send" size={15} color={palette.primary} />
            <Text style={styles.actionTextSecondary}>Send enquiry</Text>
          </Pressable>
        ) : null}
        {row.contact_phone ? (
          <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${row.contact_phone}`)}>
            <FontAwesome name="phone" size={15} color="#fff" />
            <Text style={styles.actionText}>Call</Text>
          </Pressable>
        ) : null}
        {row.contact_whatsapp ? (
          <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(`https://wa.me/${String(row.contact_whatsapp).replace(/\D/g, '')}`)}>
            <FontAwesome name="whatsapp" size={15} color="#fff" />
            <Text style={styles.actionText}>WhatsApp</Text>
          </Pressable>
        ) : null}
        {row.public_email ? (
          <Pressable style={styles.actionBtnSecondary} onPress={() => Linking.openURL(`mailto:${row.public_email}`)}>
            <FontAwesome name="envelope" size={15} color={palette.primary} />
            <Text style={styles.actionTextSecondary}>Email</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  container: { padding: layout.space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas, padding: layout.space.lg },
  emptyTitle: { color: palette.text, fontWeight: '900', fontSize: 16 },
  hero: { backgroundColor: palette.surface, borderRadius: layout.radius.xl, padding: layout.space.lg, alignItems: 'center', ...shadow.sm },
  logoImg: { width: 92, height: 92, borderRadius: 26, backgroundColor: palette.surfaceMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  logoFallback: { width: 92, height: 92, borderRadius: 26, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  heroText: { alignItems: 'center', marginTop: 14 },
  name: { color: palette.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  area: { marginTop: 6, color: palette.textSecondary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  card: { marginTop: layout.space.md, backgroundColor: palette.surface, borderRadius: layout.radius.xl, padding: layout.space.lg, ...shadow.sm },
  sectionTitle: { color: palette.primaryDark, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  desc: { marginTop: 10, color: palette.textSecondary, fontSize: 14, lineHeight: 21 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  metricPrimary: { backgroundColor: palette.primary, color: '#fff', borderRadius: layout.radius.full, paddingHorizontal: 11, paddingVertical: 8, fontSize: 12, fontWeight: '900' },
  metric: { backgroundColor: '#eef2ff', color: '#3730a3', borderRadius: layout.radius.full, paddingHorizontal: 11, paddingVertical: 8, fontSize: 12, fontWeight: '800' },
  address: { marginTop: 10, color: palette.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  muted: { marginTop: 6, color: palette.textMuted, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { backgroundColor: '#ecfdf5', color: '#047857', borderRadius: layout.radius.full, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: layout.space.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.primary, borderRadius: layout.radius.md, paddingHorizontal: 14, paddingVertical: 11 },
  actionText: { color: '#fff', fontWeight: '900' },
  actionBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.surface, borderRadius: layout.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 11 },
  actionTextSecondary: { color: palette.primary, fontWeight: '900' },
});
