import { useAuth } from '@/context/AuthContext';
import { useStudentAppMode } from '@/context/StudentAppModeContext';
import { palette } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

export function StudentModeSwitch() {
  const router = useRouter();
  const { student, library } = useAuth();
  const { studentMode, setStudentMode } = useStudentAppMode();
  const libraryConnected = Boolean(library || student?.library);

  useEffect(() => {
    if (!libraryConnected && studentMode === 'library') {
      setStudentMode('study');
    }
  }, [libraryConnected, setStudentMode, studentMode]);

  function switchMode(mode) {
    if (mode === 'library' && !libraryConnected) {
      Alert.alert('My Library', 'Connect with a library first to unlock library tabs.');
      return;
    }
    setStudentMode(mode);
    router.push('/(tabs)');
  }

  return (
    <View style={styles.switchWrap}>
      {[
        ['study', 'Study', 'gamepad'],
        ['library', 'Library', 'building-o'],
      ].map(([mode, label, icon]) => {
        const active = studentMode === mode;
        const disabled = mode === 'library' && !libraryConnected;
        const iconName = disabled ? 'lock' : icon;
        return (
          <Pressable
            key={mode}
            style={[styles.modePill, active && styles.modePillActive, disabled && styles.modePillDisabled]}
            onPress={() => switchMode(mode)}
          >
            <View style={[styles.iconBubble, active && styles.iconBubbleActive, disabled && styles.iconBubbleDisabled]}>
              <FontAwesome name={iconName} size={10} color={active ? '#fff' : disabled ? 'rgba(255,255,255,0.58)' : palette.primary} />
            </View>
            <Text style={[styles.modePillText, active && styles.modePillTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  switchWrap: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 6,
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  modePill: {
    minHeight: 32,
    minWidth: 76,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  modePillActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  modePillDisabled: {
    opacity: 0.66,
  },
  iconBubble: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  iconBubbleActive: {
    backgroundColor: palette.primary,
  },
  iconBubbleDisabled: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },
  modePillTextActive: {
    color: palette.text,
  },
});
