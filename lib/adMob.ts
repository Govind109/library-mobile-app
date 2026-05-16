import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Ad unit IDs (production). */
export const AD_UNITS = {
  banner: 'ca-app-pub-2983364415472853/5407871398',
  interstitial: 'ca-app-pub-2983364415472853/4098888060',
  appOpen: 'ca-app-pub-2983364415472853/8963973023',
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

export function getGoogleAdsDisabledReason(): string | null {
  if (Platform.OS === 'web') return 'Google Mobile Ads is a native SDK and does not run on web.';
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'Google Mobile Ads does not run in Expo Go. Use npm run android:ads or a development build.';
  }
  if (!userAllowsGoogleAds()) return 'Google ads are disabled by EXPO_PUBLIC_SHOW_GOOGLE_ADS or expo.extra.showGoogleAds.';
  return null;
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

class InterstitialScreenController {
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

  /** Full-screen interstitial; optional callback runs after close or if no ad is available. */
  show(onAfterClose?: () => void) {
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

let interstitialController: InterstitialScreenController | null = null;

export function preloadScreenInterstitial(): void {
  if (!canShowGoogleAds()) return;
  void ensureAdMobInitialized().then(async () => {
    const mod = await getGoogleAdsModule();
    if (!mod) return;
    if (!interstitialController) {
      interstitialController = new InterstitialScreenController(mod);
    }
    interstitialController.warmup();
  });
}

export function showInterstitialAfterScreenSwitches(): void {
  if (!canShowGoogleAds()) return;
  void ensureAdMobInitialized().then(async () => {
    const mod = await getGoogleAdsModule();
    if (!mod) return;
    if (!interstitialController) {
      interstitialController = new InterstitialScreenController(mod);
    }
    interstitialController.show();
  });
}

export function showLibraryDetailsInterstitial(onAfterClose?: () => void): void {
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
      interstitialController = new InterstitialScreenController(mod);
    }
    interstitialController.show(onAfterClose);
  });
}

class AppOpenPunchController {
  private ad: ReturnType<GoogleAdsModule['AppOpenAd']['createForAdRequest']>;
  private adEventType: GoogleAdsModule['AdEventType'];
  private pendingShow = false;
  private pendingAfterShow: (() => void)[] = [];
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
      this.pendingShow = false;
      this.flushPendingOnFail();
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

  tryShow(onAfterClose?: () => void) {
    if (onAfterClose) this.pendingAfterShow.push(onAfterClose);
    this.bootstrap();
    if (this.ad.loaded) {
      void this.ad.show().catch(() => this.flushPendingOnFail());
      return;
    }
    this.pendingShow = true;
    this.ad.load();
  }

  warmup() {
    this.bootstrap();
  }
}

let appOpenPunch: AppOpenPunchController | null = null;

export function preloadPunchAppOpen(): void {
  if (!canShowGoogleAds()) return;
  void ensureAdMobInitialized().then(async () => {
    const mod = await getGoogleAdsModule();
    if (!mod) return;
    if (!appOpenPunch) {
      appOpenPunch = new AppOpenPunchController(mod);
    }
    appOpenPunch.warmup();
  });
}

export function showAppOpenAd(onAfterClose?: () => void): void {
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
    if (!appOpenPunch) {
      appOpenPunch = new AppOpenPunchController(mod);
    }
    appOpenPunch.tryShow(onAfterClose);
  });
}

/** App-open ad after check-in / check-out; callback runs after dismissal or if no ad is available. */
export function showPunchAppOpen(onAfterClose?: () => void): void {
  showAppOpenAd(onAfterClose);
}
