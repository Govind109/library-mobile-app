import {
  card,
  layout,
  palette,
  primaryButton,
  primaryButtonText,
  shadow,
  typography,
} from '@/constants/Theme';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api/studentApi';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StatusBar } from 'expo-status-bar';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, ready, login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [focused, setFocused] = useState(null);

  if (ready && token) {
    return <Redirect href="/(tabs)" />;
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(loginId.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(loginId.trim() && password) && !busy;

  return (
    <View style={styles.shell}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, layout.space.xl) },
          ]}>
          <View style={[styles.hero, { paddingTop: insets.top + layout.space.md }]}>
            <View style={styles.blobA} pointerEvents="none" />
            <View style={styles.blobB} pointerEvents="none" />
            <View style={styles.brandMark}>
              <FontAwesome name="book" size={28} color={palette.onPrimary} />
            </View>
            <Text style={styles.brandName}>KYPS Library</Text>
            <Text style={styles.brandTag}>Student portal</Text>
          </View>

          <View style={[styles.card, card()]}>
            <Text style={styles.cardKicker}>Account</Text>
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.cardLead}>Use the login ID and password from your library.</Text>

            <Text style={styles.label}>Login ID</Text>
            <View
              style={[
                styles.inputShell,
                focused === 'loginId' && styles.inputShellFocused,
              ]}>
              <FontAwesome
                name="user"
                size={18}
                color={focused === 'loginId' ? palette.primary : palette.textHint}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                value={loginId}
                onChangeText={setLoginId}
                placeholder="Your student login ID"
                placeholderTextColor={palette.textHint}
                onFocus={() => setFocused('loginId')}
                onBlur={() => setFocused((f) => (f === 'loginId' ? null : f))}
                editable={!busy}
                returnKeyType="next"
                textContentType="username"
              />
            </View>

            <Text style={[styles.label, styles.labelSpaced]}>Password</Text>
            <View
              style={[
                styles.inputShell,
                focused === 'password' && styles.inputShellFocused,
              ]}>
              <FontAwesome
                name="lock"
                size={18}
                color={focused === 'password' ? palette.primary : palette.textHint}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.input, styles.inputFlex]}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={palette.textHint}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused((f) => (f === 'password' ? null : f))}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (canSubmit) void onSubmit();
                }}
                textContentType="password"
              />
              <Pressable
                hitSlop={12}
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                <FontAwesome
                  name={showPassword ? 'eye-slash' : 'eye'}
                  size={18}
                  color={palette.textMuted}
                />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <FontAwesome name="exclamation-circle" size={16} color={palette.danger} style={styles.errorIcon} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.submit,
                primaryButton(),
                pressed && styles.btnPressed,
                (!canSubmit || busy) && styles.btnDisabled,
              ]}
              onPress={() => void onSubmit()}
              disabled={!canSubmit}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
              {busy ? (
                <ActivityIndicator color={palette.onPrimary} />
              ) : (
                <Text style={primaryButtonText()}>Sign in</Text>
              )}
            </Pressable>

            <View style={styles.trustRow}>
              <FontAwesome name="shield" size={14} color={palette.textHint} />
              <Text style={[styles.trustText, styles.trustTextPad]}>Encrypted session after sign-in</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.browseLibraries, pressed && styles.browseLibrariesPressed]}
              onPress={() => router.push('/libraries')}
              accessibilityRole="link"
              accessibilityLabel="Browse public libraries without signing in">
              <FontAwesome name="map-marker" size={16} color={palette.primary} style={styles.browseIcon} />
              <Text style={styles.browseLibrariesText}>Find libraries near you</Text>
              <FontAwesome name="angle-right" size={16} color={palette.textMuted} />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  hero: {
    backgroundColor: palette.primary,
    paddingHorizontal: layout.space.xl,
    paddingBottom: layout.space.xxl + layout.space.lg,
    overflow: 'hidden',
  },
  blobA: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -40,
    right: -60,
  },
  blobB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: 20,
    left: -50,
  },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  brandName: {
    marginTop: layout.space.lg,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: palette.onPrimary,
  },
  brandTag: {
    marginTop: layout.space.xs,
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: -0.2,
  },
  card: {
    marginHorizontal: layout.space.lg,
    marginTop: -layout.space.xxl,
    paddingHorizontal: layout.space.xl,
    paddingTop: layout.space.xl,
    paddingBottom: layout.space.xl + layout.space.sm,
    ...shadow.md,
  },
  cardKicker: {
    ...typography.overline,
    color: palette.primary,
    marginBottom: layout.space.xs,
  },
  cardTitle: {
    ...typography.title,
    marginBottom: layout.space.sm,
  },
  cardLead: {
    ...typography.body,
    marginBottom: layout.space.xl,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: layout.space.xs,
  },
  labelSpaced: {
    marginTop: layout.space.md,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceMuted,
    borderRadius: layout.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: layout.space.md,
    minHeight: 52,
  },
  inputShellFocused: {
    borderColor: palette.primary,
    backgroundColor: palette.surface,
    ...shadow.sm,
  },
  inputIcon: {
    marginRight: layout.space.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: palette.text,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    paddingHorizontal: 0,
  },
  inputFlex: {
    flex: 1,
  },
  eyeBtn: {
    padding: layout.space.xs,
    marginLeft: layout.space.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: palette.dangerSoft,
    borderRadius: layout.radius.md,
    padding: layout.space.md,
    marginTop: layout.space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(220, 38, 38, 0.12)',
  },
  errorIcon: {
    marginTop: 2,
    marginRight: layout.space.sm,
  },
  errorText: {
    flex: 1,
    color: palette.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  submit: {
    marginTop: layout.space.xl,
    minHeight: 52,
    borderRadius: layout.radius.lg,
  },
  btnPressed: {
    opacity: 0.92,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: layout.space.xl,
  },
  trustText: {
    ...typography.micro,
    color: palette.textHint,
  },
  trustTextPad: {
    marginLeft: layout.space.sm,
  },
  browseLibraries: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: layout.space.lg,
    paddingVertical: layout.space.md,
    paddingHorizontal: layout.space.md,
    borderRadius: layout.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  },
  browseIcon: {
    marginRight: layout.space.sm,
  },
  browseLibrariesPressed: {
    opacity: 0.85,
    backgroundColor: palette.primarySoft,
  },
  browseLibrariesText: {
    flex: 1,
    marginRight: layout.space.sm,
    fontSize: 15,
    fontWeight: '600',
    color: palette.primary,
    letterSpacing: -0.2,
  },
});
