import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { card, layout, palette, shadow, typography } from '@/constants/Theme';
import { useAuth } from '@/context/AuthContext';
import { resolveMediaCandidates } from '@/lib/config';
import { qrImageUrl } from '@/lib/qr';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DigitalIdCardScreen() {
  const insets = useSafeAreaInsets();
  const { student, library } = useAuth();
  const photoCandidates = useMemo(() => resolveMediaCandidates(student?.photo_url), [student?.photo_url]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoUri = photoCandidates[photoIndex] ?? null;
  const qrPayload = student?.digital_id_qr_payload || '';

  useEffect(() => {
    setPhotoIndex(0);
  }, [student?.photo_url]);

  return (
    <ScreenWithBanner>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + layout.space.xxl }]}>
        <View style={[card(), styles.cardShell]}>
          <View style={styles.header}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={styles.photo}
                contentFit="cover"
                onError={() => setPhotoIndex((prev) => (prev + 1 < photoCandidates.length ? prev + 1 : prev))}
              />
            ) : (
              <View style={styles.photoFallback}>
                <FontAwesome name="user" size={34} color={palette.primary} />
              </View>
            )}
            <View style={styles.headerText}>
              <Text style={styles.overline}>Digital student ID</Text>
              <Text style={styles.name}>{student?.name || 'Student'}</Text>
              <Text style={styles.login}>{student?.login_id || '-'}</Text>
            </View>
          </View>

          <View style={styles.qrBox}>
            {qrPayload ? (
              <Image source={{ uri: qrImageUrl(qrPayload, 320) }} style={styles.qr} contentFit="contain" />
            ) : (
              <Text style={styles.muted}>QR not available. Pull to refresh your profile.</Text>
            )}
          </View>

          <View style={styles.metaGrid}>
            <Info label="Library" value={library?.name || '-'} />
            <Info label="Joined" value={student?.joining_date || '-'} />
            <Info label="Phone" value={student?.phone || '-'} />
            <Info label="Status" value={student?.status === 'active' ? 'Active' : 'Inactive'} />
          </View>
        </View>
      </ScrollView>
    </ScreenWithBanner>
  );
}

function Info({ label, value }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.space.lg, backgroundColor: palette.canvas },
  cardShell: { overflow: 'hidden', padding: 0, ...shadow.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: layout.space.md, padding: layout.space.xl, backgroundColor: palette.primaryDark },
  photo: { width: 82, height: 82, borderRadius: 18, backgroundColor: palette.surface },
  photoFallback: { width: 82, height: 82, borderRadius: 18, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  overline: { color: '#bfdbfe', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  name: { marginTop: 6, color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  login: { marginTop: 4, color: '#dbeafe', fontSize: 14, fontWeight: '700' },
  qrBox: { alignItems: 'center', justifyContent: 'center', padding: layout.space.xl, backgroundColor: palette.surface },
  qr: { width: 270, height: 270 },
  muted: { ...typography.caption, textAlign: 'center' },
  metaGrid: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, padding: layout.space.lg, gap: layout.space.sm },
  info: { flexDirection: 'row', justifyContent: 'space-between', gap: layout.space.md, paddingVertical: 8 },
  infoLabel: { color: palette.textMuted, fontSize: 13, fontWeight: '700' },
  infoValue: { flex: 1, textAlign: 'right', color: palette.text, fontSize: 14, fontWeight: '700' },
});
