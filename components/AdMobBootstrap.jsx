import { useAuth } from '@/context/AuthContext';
import { ensureAdMobInitialized, getGoogleAdsDisabledReason, preloadPunchAppOpen, preloadScreenInterstitial, showAppOpenAd } from '@/lib/adMob';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const APP_OPEN_AD_FREQ_KEY = 'kyps_app_open_ad_frequency_v1';
const APP_OPEN_AD_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const APP_OPEN_AD_DAILY_LIMIT = 3;

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function shouldShowLoggedInAppOpenAd() {
  const now = Date.now();
  const today = todayKey();
  let record = null;
  try {
    const raw = await SecureStore.getItemAsync(APP_OPEN_AD_FREQ_KEY);
    record = raw ? JSON.parse(raw) : null;
  } catch {
    record = null;
  }

  const sameDay = record?.date === today;
  const count = sameDay ? Number(record?.count || 0) : 0;
  const lastShownAt = sameDay ? Number(record?.lastShownAt || 0) : 0;
  if (count >= APP_OPEN_AD_DAILY_LIMIT) return false;
  if (lastShownAt && now - lastShownAt < APP_OPEN_AD_COOLDOWN_MS) return false;

  await SecureStore.setItemAsync(
    APP_OPEN_AD_FREQ_KEY,
    JSON.stringify({
      date: today,
      count: count + 1,
      lastShownAt: now,
    }),
  );
  return true;
}

/** Initializes ad preloading once for development / production native builds (no-op in Expo Go). */
export function AdMobBootstrap() {
  const { ready, token } = useAuth();
  const appState = useRef(AppState.currentState);
  const initialOpenHandled = useRef(false);
  const showingCheckRef = useRef(false);

  useEffect(() => {
    const disabledReason = getGoogleAdsDisabledReason();
    if (__DEV__ && disabledReason) {
      console.info(`[AdMob] ${disabledReason}`);
      return;
    }

    void ensureAdMobInitialized().finally(() => {
      preloadScreenInterstitial();
      preloadPunchAppOpen();
    });
  }, []);

  async function maybeShowLoggedInAppOpenAd() {
    if (!ready || !token || showingCheckRef.current) return;
    if (getGoogleAdsDisabledReason()) return;
    if (!(await shouldShowLoggedInAppOpenAd())) return;
    showingCheckRef.current = true;
    try {
      showAppOpenAd();
    } finally {
      setTimeout(() => {
        showingCheckRef.current = false;
      }, 1200);
    }
  }

  useEffect(() => {
    if (!ready || !token || initialOpenHandled.current) return;
    initialOpenHandled.current = true;
    const timer = setTimeout(() => {
      void maybeShowLoggedInAppOpenAd();
    }, 1400);
    return () => clearTimeout(timer);
  }, [ready, token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current === 'background' || appState.current === 'inactive';
      appState.current = nextState;
      if (nextState === 'active' && wasBackground) {
        void maybeShowLoggedInAppOpenAd();
      }
    });
    return () => subscription.remove();
  }, [ready, token]);

  return null;
}
