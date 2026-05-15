import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl, resolveMediaCandidates } from '@/lib/config';
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
                <FontAwesome name="user" size={40} color={palette.primary} />
              </View>
            )}
          </View>
          <Text style={[typography.title, styles.name]}>{student?.name}</Text>
          <Text style={[typography.caption, styles.loginId]}>{student?.login_id}</Text>
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
                <FontAwesome name="university" size={12} color={palette.primaryDark} />
              )}
              <Text style={styles.lib}>{library.name}</Text>
            </View>
          ) : null}
          {student?.preparation ? (
            <View style={styles.prepPill}>
              <FontAwesome name="graduation-cap" size={12} color={palette.primaryDark} />
              <Text style={styles.prepText}>Preparing for {student.preparation}</Text>
            </View>
          ) : null}
          {dueAmount != null && dueAmount >= 0.01 ? (
            <View style={styles.duePill}>
              <Text style={styles.due}>Due {formatInr(dueAmount)}</Text>
            </View>
          ) : null}
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

        <Text style={[typography.micro, styles.apiHint]}>{getApiBaseUrl()}</Text>
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
    padding: layout.space.xl,
    alignItems: 'center',
    marginBottom: layout.space.xl,
  },
  avatarWrap: {
    marginBottom: layout.space.md,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: palette.surface,
    ...shadow.md,
  },
  photoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  name: {
    textAlign: 'center',
  },
  loginId: {
    marginTop: layout.space.xs,
    textAlign: 'center',
  },
  libPill: {
    marginTop: layout.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: layout.space.md,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(37, 99, 235, 0.15)',
  },
  lib: {
    color: palette.primaryDark,
    fontWeight: '600',
    fontSize: 13,
  },
  libLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 54, 124, 0.18)',
    backgroundColor: palette.surface,
  },
  prepPill: {
    marginTop: layout.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E9F5FF',
    paddingHorizontal: layout.space.md,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 54, 124, 0.18)',
  },
  prepText: {
    color: palette.primaryDark,
    fontWeight: '600',
    fontSize: 13,
  },
  duePill: {
    marginTop: layout.space.md,
    backgroundColor: palette.dangerSoft,
    paddingHorizontal: layout.space.md,
    paddingVertical: 6,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.12)',
  },
  due: {
    color: palette.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  menuLabel: {
    marginBottom: layout.space.sm,
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: layout.space.lg,
    marginBottom: layout.space.sm,
    gap: layout.space.md,
  },
  rowPressed: {
    opacity: 0.92,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: palette.text,
    letterSpacing: -0.2,
  },
  logoutBtn: {
    marginTop: layout.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: layout.space.sm,
    padding: layout.space.lg,
    borderRadius: layout.radius.md,
    backgroundColor: palette.dangerSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  logoutText: {
    color: palette.danger,
    fontWeight: '700',
    fontSize: 16,
  },
  apiHint: {
    marginTop: layout.space.xl,
    textAlign: 'center',
    paddingHorizontal: layout.space.lg,
  },
});
