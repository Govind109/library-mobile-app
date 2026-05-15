import { ensureAdMobInitialized, preloadAppOpen, preloadPunchInterstitial } from '@/lib/adMob';
import { useEffect } from 'react';

/** Initializes ad preloading once for development / production native builds (no-op in Expo Go). */
export function AdMobBootstrap() {
  useEffect(() => {
    void ensureAdMobInitialized().finally(() => {
      preloadPunchInterstitial();
      preloadAppOpen();
    });
  }, []);
  return null;
}
