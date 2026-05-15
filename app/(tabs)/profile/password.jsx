import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { ApiError, studentChangePassword } from '@/lib/api/studentApi';
import { input, layout, palette, primaryButton, primaryButtonText, typography } from '@/constants/Theme';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [current, setCurrent] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!token) return;
    if (nextPw.length < 6) {
      Alert.alert('Validation', 'New password must be at least 6 characters.');
      return;
    }
    if (nextPw !== confirm) {
      Alert.alert('Validation', 'Confirmation does not match.');
      return;
    }
    setBusy(true);
    try {
      await studentChangePassword(token, current, nextPw, confirm);
      Alert.alert('Success', 'Your password was updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      setCurrent('');
      setNextPw('');
      setConfirm('');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not update password.';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenWithBanner>
      <View style={styles.root}>
        <View style={styles.field}>
          <Text style={styles.label}>Current password</Text>
          <TextInput
            style={input()}
            secureTextEntry
            value={current}
            onChangeText={setCurrent}
            autoCapitalize="none"
            placeholderTextColor={palette.textHint}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <TextInput
            style={input()}
            secureTextEntry
            value={nextPw}
            onChangeText={setNextPw}
            autoCapitalize="none"
            placeholderTextColor={palette.textHint}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={input()}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="none"
            placeholderTextColor={palette.textHint}
          />
        </View>

        <Pressable
          style={[primaryButton(), busy && styles.btnDisabled]}
          onPress={() => void onSubmit()}
          disabled={busy}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={primaryButtonText()}>Update password</Text>
          )}
        </Pressable>
      </View>
    </ScreenWithBanner>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: layout.space.lg,
    backgroundColor: palette.canvas,
  },
  field: {
    marginBottom: layout.space.lg,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: layout.space.xs,
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
