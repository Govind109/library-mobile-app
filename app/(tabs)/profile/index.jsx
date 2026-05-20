import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { resolveMediaCandidates } from '@/lib/config';
import { formatInr } from '@/lib/format';
import { card, cardFlat, layout, palette, shadow, typography } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ProfileHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { student, library, alerts, logout } = useAuth();

  const paymentDue = alerts.find((a) => a.type === 'payment_due');
  const studentPhotoCandidates = useMemo(
    () => resolveMediaCandidates(student?.photo_url),
    [student?.photo_url]
  );
  const libraryLogoCandidates = useMemo(
    () => resolveMediaCandidates(library?.logo_url),
    [library?.logo_url]
  );
  const [studentPhotoIndex, setStudentPhotoIndex] = useState(0);
  const [libraryLogoIndex, setLibraryLogoIndex] = useState(0);
  const studentPhotoUri = studentPhotoCandidates[studentPhotoIndex] ?? null;
  const libraryLogoUri = libraryLogoCandidates[libraryLogoIndex] ?? null;
  const dueAmount =
    paymentDue && typeof paymentDue.meta?.total_due === 'number'
      ? paymentDue.meta.total_due
      : null;

  useEffect(() => {
    setStudentPhotoIndex(0);
  }, [student?.photo_url]);

  useEffect(() => {
    setLibraryLogoIndex(0);
  }, [library?.logo_url]);

  function confirmLogout() {
    Alert.alert('Log out', 'End your session on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }

  return (
    <ScreenWithBanner>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + layout.space.xxl },
        ]}>
        <View style={[card(), styles.hero]}>
          <View style={styles.avatarWrap}>
            {studentPhotoUri ? (
              <Image
                source={{ uri: studentPhotoUri }}
                style={styles.photo}
                contentFit="cover"
                onError={() =>
                  setStudentPhotoIndex((prev) =>
                    prev + 1 < studentPhotoCandidates.length ? prev + 1 : prev
                  )
                }
              />
            ) : (
              <View style={styles.photoPlaceholder}>
                <FontAwesome name="user" size={24} color={palette.primary} />
              </View>
            )}
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.name} numberOfLines={1}>{student?.name}</Text>
            <Text style={styles.loginId}>{student?.login_id}</Text>
            <View style={styles.heroPills}>
              {library?.name ? (
                <View style={styles.libPill}>
                  {libraryLogoUri ? (
                    <Image
                      source={{ uri: libraryLogoUri }}
                      style={styles.libLogo}
                      contentFit="cover"
                      onError={() =>
                        setLibraryLogoIndex((prev) =>
                          prev + 1 < libraryLogoCandidates.length ? prev + 1 : prev
                        )
                      }
                    />
                  ) : (
                    <FontAwesome name="university" size={11} color={palette.primaryDark} />
                  )}
                  <Text style={styles.lib} numberOfLines={1}>{library.name}</Text>
                </View>
              ) : null}
              {student?.preparation ? (
                <View style={styles.prepPill}>
                  <FontAwesome name="graduation-cap" size={11} color={palette.primaryDark} />
                  <Text style={styles.prepText} numberOfLines={1}>{student.preparation}</Text>
                </View>
              ) : null}
              {dueAmount != null && dueAmount >= 0.01 ? (
                <View style={styles.duePill}>
                  <Text style={styles.due}>Due {formatInr(dueAmount)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <Text style={[typography.overline, styles.menuLabel]}>Account</Text>
        <Pressable
          style={({ pressed }) => [cardFlat(), styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/(tabs)/profile/id-card')}
          android_ripple={{ color: palette.borderSubtle }}>
          <View style={styles.rowIcon}>
            <FontAwesome name="qrcode" size={16} color={palette.primary} />
          </View>
          <Text style={styles.rowText}>Digital ID card</Text>
          <FontAwesome name="chevron-right" size={12} color={palette.textHint} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [cardFlat(), styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/(tabs)/profile/edit')}
          android_ripple={{ color: palette.borderSubtle }}>
          <View style={styles.rowIcon}>
            <FontAwesome name="pencil" size={16} color={palette.primary} />
          </View>
          <Text style={styles.rowText}>Edit profile</Text>
          <FontAwesome name="chevron-right" size={12} color={palette.textHint} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [cardFlat(), styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/(tabs)/profile/password')}
          android_ripple={{ color: palette.borderSubtle }}>
          <View style={styles.rowIcon}>
            <FontAwesome name="lock" size={16} color={palette.primary} />
          </View>
          <Text style={styles.rowText}>Change password</Text>
          <FontAwesome name="chevron-right" size={12} color={palette.textHint} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.9 }]}
          onPress={confirmLogout}
          android_ripple={{ color: 'rgba(220,38,38,0.15)' }}>
          <FontAwesome name="sign-out" size={16} color={palette.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>

      </ScrollView>
    </ScreenWithBanner>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: layout.space.lg,
    backgroundColor: palette.canvas,
  },
  hero: {
    padding: layout.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: layout.space.md,
    marginBottom: layout.space.md,
  },
  avatarWrap: {
    alignSelf: 'flex-start',
  },
  photo: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: palette.surface,
    ...shadow.sm,
  },
  photoPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.text,
    letterSpacing: -0.3,
  },
  loginId: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: palette.textMuted,
  },
  heroPills: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  libPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(37, 99, 235, 0.15)',
    maxWidth: '100%',
  },
  lib: {
    color: palette.primaryDark,
    fontWeight: '700',
    fontSize: 12,
    maxWidth: 170,
  },
  libLogo: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 54, 124, 0.18)',
    backgroundColor: palette.surface,
  },
  prepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E9F5FF',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 54, 124, 0.18)',
  },
  prepText: {
    color: palette.primaryDark,
    fontWeight: '700',
    fontSize: 12,
    maxWidth: 150,
  },
  duePill: {
    backgroundColor: palette.dangerSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.12)',
  },
  due: {
    color: palette.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  menuLabel: {
    marginBottom: 6,
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.space.md,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  rowPressed: {
    opacity: 0.92,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: -0.2,
  },
  logoutBtn: {
    marginTop: layout.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: layout.space.sm,
    paddingVertical: 12,
    paddingHorizontal: layout.space.md,
    borderRadius: layout.radius.md,
    backgroundColor: palette.dangerSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  logoutText: {
    color: palette.danger,
    fontWeight: '700',
    fontSize: 14,
  },
});
