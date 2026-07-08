import { palette, layout, shadow } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

function normalizeButtons(buttons) {
  if (Array.isArray(buttons) && buttons.length > 0) return buttons;
  return [{ text: 'OK' }];
}

function alertTone(buttons) {
  if (buttons?.some((button) => button?.style === 'destructive')) return 'danger';
  if (buttons?.some((button) => button?.style === 'cancel')) return 'warning';
  return 'primary';
}

function looksTechnical(value) {
  const text = String(value || '').toLowerCase();
  return [
    'token',
    'jwt',
    'unauthenticated',
    'sqlstate',
    'exception',
    'stack trace',
    'undefined variable',
    'argument #',
    'syntax error',
    'internal server error',
    'request failed',
    'bearer',
    'authorization',
    'fcm_token',
    'expo_push_token',
    'database',
    'queryexception',
    'typeerror',
    'errorexception',
    'file:',
    'line:',
  ].some((needle) => text.includes(needle));
}

function safeAlertText(value, fallback) {
  const text = value == null ? '' : String(value).trim();
  if (!text) return '';
  return looksTechnical(text) ? fallback : text;
}

export function CustomAlertProvider({ children }) {
  const originalAlertRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const current = queue[0] ?? null;
  const tone = alertTone(current?.buttons);
  const iconName = tone === 'danger' ? 'exclamation-triangle' : tone === 'warning' ? 'bell' : 'info-circle';
  const iconColor = tone === 'danger' ? palette.danger : tone === 'warning' ? palette.warning : palette.primary;
  const iconBg = tone === 'danger' ? palette.dangerSoft : tone === 'warning' ? palette.warningSoft : palette.primarySoft;

  const showAlert = useCallback((title, message, buttons, options) => {
    const next = {
      id: `${Date.now()}-${Math.random()}`,
      title: safeAlertText(title, 'Unable to continue'),
      message: safeAlertText(message, 'Something went wrong. Please try again.'),
      buttons: normalizeButtons(buttons),
      options: options ?? {},
    };
    setQueue((items) => [...items, next]);
  }, []);

  useEffect(() => {
    originalAlertRef.current = Alert.alert;
    Alert.alert = showAlert;

    return () => {
      if (originalAlertRef.current) Alert.alert = originalAlertRef.current;
    };
  }, [showAlert]);

  const closeCurrent = useCallback((button, dismissed = false) => {
    const closing = queue[0];
    if (!closing) return;

    setQueue((items) => items.slice(1));
    setTimeout(() => {
      if (dismissed) closing.options?.onDismiss?.();
      button?.onPress?.();
    }, 0);
  }, [queue]);

  const dismissCurrent = useCallback(() => {
    if (!current || current.options?.cancelable === false) return;
    const cancelButton = current.buttons.find((button) => button?.style === 'cancel');
    closeCurrent(cancelButton, true);
  }, [closeCurrent, current]);

  return (
    <>
      {children}
      <Modal visible={Boolean(current)} transparent animationType="fade" onRequestClose={dismissCurrent}>
        <View style={styles.root}>
          <Pressable style={styles.scrim} onPress={dismissCurrent} />
          <View style={styles.card}>
            <View style={styles.handle} />
            <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
              <FontAwesome name={iconName} size={22} color={iconColor} />
            </View>
            <Text style={styles.title}>{current?.title || 'Alert'}</Text>
            {current?.message ? <Text style={styles.message}>{current.message}</Text> : null}
            <View style={[styles.actions, (current?.buttons?.length ?? 0) > 2 && styles.actionsStacked]}>
              {current?.buttons?.map((button, index) => {
                const isCancel = button?.style === 'cancel';
                const isDanger = button?.style === 'destructive';
                const isPreferred = !isCancel && index === current.buttons.length - 1;
                return (
                  <Pressable
                    key={`${button?.text || 'OK'}-${index}`}
                    style={({ pressed }) => [
                      styles.button,
                      isPreferred && styles.primaryButton,
                      isCancel && styles.cancelButton,
                      isDanger && styles.dangerButton,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => closeCurrent(button)}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isPreferred && styles.primaryButtonText,
                        isCancel && styles.cancelButtonText,
                        isDanger && styles.dangerButtonText,
                      ]}
                    >
                      {button?.text || 'OK'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: layout.space.xl },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.52)' },
  card: {
    alignItems: 'center',
    paddingHorizontal: layout.space.xl,
    paddingTop: layout.space.md,
    paddingBottom: layout.space.xl,
    borderRadius: 28,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.md,
  },
  handle: { width: 44, height: 4, borderRadius: 999, backgroundColor: '#cbd5e1', marginBottom: layout.space.lg },
  iconWrap: { width: 58, height: 58, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: layout.space.md },
  title: { textAlign: 'center', fontSize: 20, fontWeight: '900', color: palette.text, letterSpacing: -0.45 },
  message: { marginTop: layout.space.sm, textAlign: 'center', fontSize: 14, lineHeight: 21, fontWeight: '600', color: palette.textMuted },
  actions: { flexDirection: 'row', gap: layout.space.sm, alignSelf: 'stretch', marginTop: layout.space.xl },
  actionsStacked: { flexDirection: 'column' },
  button: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.space.md,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSubtle,
  },
  primaryButton: { backgroundColor: palette.primary, borderColor: palette.primary },
  cancelButton: { backgroundColor: palette.surfaceMuted },
  dangerButton: { backgroundColor: palette.dangerSoft, borderColor: 'rgba(220,38,38,0.18)' },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  buttonText: { fontSize: 14, fontWeight: '900', color: palette.text },
  primaryButtonText: { color: '#fff' },
  cancelButtonText: { color: palette.textMuted },
  dangerButtonText: { color: palette.danger },
});
