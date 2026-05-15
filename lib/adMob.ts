import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Ad unit IDs (production). */
export const AD_UNITS = {
  banner: 'ca-app-pub-2983364415472853/8702662303',
  interstitial: 'ca-app-pub-2983364415472853/2339381582',
  appOpen: 'ca-app-pub-2983364415472853/8187656987',
} as const;

const TEST_AD_UNITS = {
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  appOpen: 'ca-app-pub-3940256099942544/9257395921',
} as const;

export function getAdUnitId(type: keyof typeof AD_UNITS): string {
  if (__DEV__) return TEST_AD_UNITS[type];
  return AD_UNITS[type];
}

const requestOptions = { requestNonPersonalizedAdsOnly: true };

/**
 * Ads run on native dev/production builds when allowed here. Disable with
 * `EXPO_PUBLIC_SHOW_GOOGLE_ADS=no` or `expo.extra.showGoogleAds: false` in app.json.
 */
function userAllowsGoogleAds(): boolean {
  const env = process.env.EXPO_PUBLIC_SHOW_GOOGLE_ADS?.trim().toLowerCase();
  if (env === 'true' || env === '1' || env === 'yes') return true;
  if (env === 'false' || env === '0' || env === 'no') return false;

  const extra = Constants.expoConfig?.extra as { showGoogleAds?: boolean } | undefined;
  if (typeof extra?.showGoogleAds === 'boolean') {
    return extra.showGoogleAds;
  }

  return true;
}

/** Web / Expo Go cannot run the native Google Mobile Ads SDK. */
export function canShowGoogleAds(): boolean {
  if (Platform.OS === 'web') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return userAllowsGoogleAds();
}

type GoogleAdsModule = typeof import('react-native-google-mobile-ads');

let googleAdsModulePromise: Promise<GoogleAdsModule | null> | null = null;

async function getGoogleAdsModule(): Promise<GoogleAdsModule | null> {
  if (!canShowGoogleAds()) return null;
  if (!googleAdsModulePromise) {
    googleAdsModulePromise = import('react-native-google-mobile-ads').catch(() => null);
  }
  return googleAdsModulePromise;
}

let initPromise: Promise<void> | null = null;

export function ensureAdMobInitialized(): Promise<void> {
  if (!canShowGoogleAds()) return Promise.resolve();
  if (!initPromise) {
    initPromise = getGoogleAdsModule().then((mod) => {
      if (!mod) return;
      return mod.MobileAds()
        .initialize()
        .then(() => undefined);
    });
  }
  return initPromise;
}

class InterstitialPunchController {
  private ad: ReturnType<GoogleAdsModule['InterstitialAd']['createForAdRequest']>;
  private adEventType: GoogleAdsModule['AdEventType'];
  private pendingShow = false;
  private pendingAfterShow: (() => void)[] = [];
  private bootstrapped = false;

  constructor(mod: GoogleAdsModule) {
    this.adEventType = mod.AdEventType;
    this.ad = mod.InterstitialAd.createForAdRequest(getAdUnitId('interstitial'), requestOptions);
  }

  private bootstrap() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    this.ad.addAdEventListener(this.adEventType.LOADED, () => {
      if (this.pendingShow && this.ad.loaded) {
        this.pendingShow = false;
        void this.ad.show().catch(() => this.flushPendingOnFail());
      }
    });

    this.ad.addAdEventListener(this.adEventType.CLOSED, () => {
      const cbs = this.pendingAfterShow.splice(0);
      for (const fn of cbs) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      this.ad.load();
    });

    this.ad.addAdEventListener(this.adEventType.ERROR, () => {
      if (this.pendingShow) {
        this.pendingShow = false;
        this.flushPendingOnFail();
      }
      setTimeout(() => this.ad.load(), 2500);
    });

    this.ad.load();
  }

  private flushPendingOnFail() {
    const cbs = this.pendingAfterShow.splice(0);
    for (const fn of cbs) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  /** Preload interstitial (call once at app start when ads are allowed). */
  warmup() {
    this.bootstrap();
  }

  /** Full-screen ad after check-in / check-out; optional callback runs after ad is dismissed or if no ad. */
  showWithOptionalFollowUp(onAfterClose?: () => void) {
    if (onAfterClose) this.pendingAfterShow.push(onAfterClose);

    this.bootstrap();

    if (this.ad.loaded) {
      void this.ad.show().catch(() => this.flushPendingOnFail());
      return;
    }
    this.pendingShow = true;
    this.ad.load();
  }
}

let interstitialController: InterstitialPunchController | null = null;

export function preloadPunchInterstitial(): void {
  if (!canShowGoogleAds()) return;
  void ensureAdMobInitialized().then(async () => {
    const mod = await getGoogleAdsModule();
    if (!mod) return;
    if (!interstitialController) {
      interstitialController = new InterstitialPunchController(mod);
    }
    interstitialController.warmup();
  });
}

export function showPunchInterstitial(onAfterClose?: () => void): void {
  if (!canShowGoogleAds()) {
    onAfterClose?.();
    return;
  }
  void ensureAdMobInitialized().then(async () => {
    const mod = await getGoogleAdsModule();
    if (!mod) {
      onAfterClose?.();
      return;
    }
    if (!interstitialController) {
      interstitialController = new InterstitialPunchController(mod);
    }
    interstitialController.showWithOptionalFollowUp(onAfterClose);
  });
}

class AppOpenNavController {
  private ad: ReturnType<GoogleAdsModule['AppOpenAd']['createForAdRequest']>;
  private adEventType: GoogleAdsModule['AdEventType'];
  private pendingShow = false;
  private bootstrapped = false;

  constructor(mod: GoogleAdsModule) {
    this.adEventType = mod.AdEventType;
    this.ad = mod.AppOpenAd.createForAdRequest(getAdUnitId('appOpen'), requestOptions);
  }

  private bootstrap() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    this.ad.addAdEventListener(this.adEventType.LOADED, () => {
      if (this.pendingShow && this.ad.loaded) {
        this.pendingShow = false;
        void this.ad.show().catch(() => {});
      }
    });

    this.ad.addAdEventListener(this.adEventType.CLOSED, () => {
      this.ad.load();
    });

    this.ad.addAdEventListener(this.adEventType.ERROR, () => {
      this.pendingShow = false;
      setTimeout(() => this.ad.load(), 2500);
    });

    this.ad.load();
  }

  tryShow() {
    this.bootstrap();
    if (this.ad.loaded) {
      void this.ad.show().catch(() => {});
      return;
    }
    this.pendingShow = true;
    this.ad.load();
  }

  warmup() {
    this.bootstrap();
  }
}

let appOpenNav: AppOpenNavController | null = null;

export function preloadAppOpen(): void {
  if (!canShowGoogleAds()) return;
  void ensureAdMobInitialized().then(async () => {
    const mod = await getGoogleAdsModule();
    if (!mod) return;
    if (!appOpenNav) {
      appOpenNav = new AppOpenNavController(mod);
    }
    appOpenNav.warmup();
  });
}

/** Every 3rd screen navigation (after the first route is set). */
export function showAppOpenAfterScreenSwitches(): void {
  if (!canShowGoogleAds()) return;
  void ensureAdMobInitialized().then(async () => {
    const mod = await getGoogleAdsModule();
    if (!mod) return;
    if (!appOpenNav) {
      appOpenNav = new AppOpenNavController(mod);
    }
    appOpenNav.tryShow();
  });
}
