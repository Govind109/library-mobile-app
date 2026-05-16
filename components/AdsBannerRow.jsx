import { canShowGoogleAds, ensureAdMobInitialized, getAdUnitId, getGoogleAdsDisabledReason } from '@/lib/adMob';
import { palette } from '@/constants/Theme';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Banner ad rendered directly below the top navigation header.
 * Hidden (zero height) until the ad loads successfully — no blank gap on failure.
 * No-op in Expo Go or web.
 */
export function AdsBannerRow({ placement = 'top', style }) {
  const [initialized, setInitialized] = useState(false);
  const [adVisible, setAdVisible] = useState(false);

  useEffect(() => {
    if (!canShowGoogleAds()) {
      const disabledReason = getGoogleAdsDisabledReason();
      if (__DEV__ && disabledReason) console.info(`[AdMob Banner] ${disabledReason}`);
      return;
    }
    ensureAdMobInitialized()
      .then(() => setInitialized(true))
      .catch((error) => {
        if (__DEV__) console.warn('[AdMob Banner] Initialization failed', error);
      });
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
      style={[styles.wrap, placement === 'inline' && styles.inline, !adVisible && styles.collapsed, style]}
      collapsable={false}
      pointerEvents={adVisible ? 'box-none' : 'none'}
    >
      <BannerAd
        unitId={getAdUnitId('banner')}
        size={placement === 'inline' ? BannerAdSize.INLINE_ADAPTIVE_BANNER : BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => setAdVisible(true)}
        onAdFailedToLoad={(error) => {
          if (__DEV__) console.warn('[AdMob Banner] Failed to load', error);
          setAdVisible(false);
        }}
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
  inline: {
    borderBottomWidth: 0,
    marginBottom: 12,
  },
  collapsed: {
    height: 0,
    borderBottomWidth: 0,
  },
});
