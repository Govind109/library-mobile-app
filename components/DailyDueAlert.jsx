import { useAuth } from '@/context/AuthContext';
import { formatInrErp } from '@/lib/format';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

const DUE_ALERT_KEY_PREFIX = 'student_due_alert_seen_v1';

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dueFromAlert(alert) {
  const amount = Number(alert?.meta?.total_due);
  return Number.isFinite(amount) ? amount : 0;
}

export function DailyDueAlert() {
  const router = useRouter();
  const { ready, token, student, alerts } = useAuth();
  const showingRef = useRef(false);

  useEffect(() => {
    if (!ready || !token || !student || showingRef.current) return;

    const paymentDue = alerts.find((item) => item.type === 'payment_due');
    const dueAmount = dueFromAlert(paymentDue);
    if (!paymentDue || dueAmount < 0.01) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const studentKey = student.id || student.login_id || 'student';
        const storageKey = `${DUE_ALERT_KEY_PREFIX}:${studentKey}:${todayKey()}`;
        const alreadySeen = await SecureStore.getItemAsync(storageKey);
        if (cancelled || alreadySeen) return;

        showingRef.current = true;
        await SecureStore.setItemAsync(storageKey, '1');

        Alert.alert(
          paymentDue.title || 'Fee due reminder',
          paymentDue.message || `Your outstanding balance is ${formatInrErp(dueAmount)}.`,
          [
            {
              text: 'Later',
              style: 'cancel',
              onPress: () => {
                showingRef.current = false;
              },
            },
            {
              text: 'View fees',
              onPress: () => {
                showingRef.current = false;
                router.push('/(tabs)/fees');
              },
            },
          ],
        );
      })();
    }, 1800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [alerts, ready, router, student, token]);

  return null;
}
