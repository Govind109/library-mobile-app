import { canShowGoogleAds, ensureAdMobInitialized, getAdUnitId } from '@/lib/adMob';
import { palette } from '@/constants/Theme';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Banner ad rendered directly below the top navigation header.
 * Hidden (zero height) until the ad loads successfully — no blank gap on failure.
 * No-op in Expo Go or web.
 */
export function AdsBannerRow() {
  const [initialized, setInitialized] = useState(false);
  const [adVisible, setAdVisible] = useState(false);

  useEffect(() => {
    if (!canShowGoogleAds()) return;
    ensureAdMobInitialized()
      .then(() => setInitialized(true))
      .catch(() => {});
  }, []);

  if (!canShowGoogleAds() || !initialized) return null;

  let BannerAd, BannerAdSize;
  try {
    ({ BannerAd, BannerAdSize } = require('react-native-google-mobile-ads'));
  } catch {
    return null;
  }

  return (
    <View
      style={[styles.wrap, !adVisible && styles.collapsed]}
      collapsable={false}
      pointerEvents={adVisible ? 'box-none' : 'none'}
    >
      <BannerAd
        unitId={getAdUnitId('banner')}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => setAdVisible(true)}
        onAdFailedToLoad={() => setAdVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: palette.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSubtle,
    overflow: 'hidden',
  },
  collapsed: {
    height: 0,
    borderBottomWidth: 0,
  },
});
