import { canShowGoogleAds, ensureAdMobInitialized, showAppOpenAfterScreenSwitches } from '@/lib/adMob';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Shows an App Open full-screen ad every 3rd tab/screen change.
 * The first path mount is ignored (it's the initial render, not a navigation).
 * Counter: change #1 → no ad, #2 → no ad, #3 → show ad, #4 → no ad … repeat.
 */
export function TabAppOpenAdListener() {
  const pathname = usePathname();
  const mounted = useRef(false);   // true after the initial path is recorded
  const switchCount = useRef(0);

  useEffect(() => {
    if (!canShowGoogleAds()) return;

    // Skip the very first render — that's just the initial route being set.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    switchCount.current += 1;

    // Show every 3rd actual navigation.
    if (switchCount.current % 3 !== 0) return;

    void ensureAdMobInitialized().then(() => {
      showAppOpenAfterScreenSwitches();
    });
  // pathname change drives this effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
