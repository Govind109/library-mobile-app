import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { studentRegisterDeviceToken } from '@/lib/api/studentApi';

const ANDROID_DEFAULT_CHANNEL = 'default';
const ANDROID_REMINDERS_CHANNEL = 'reminders';
const ANDROID_BILLING_CHANNEL = 'billing';

const PUSH_TOKEN_CACHE_KEY = 'student_local_push_token_v1';

type CachedPushPayload = {
  fcm_token: string;
  platform: 'android' | 'ios' | 'unknown';
  savedAt: number;
};

function normalizePlatform(p: string | undefined): 'android' | 'ios' | 'unknown' {
  if (p === 'android' || p === 'ios') return p;
  return 'unknown';
}

async function loadCachedPushToken(): Promise<CachedPushPayload | null> {
  try {
    const raw = await SecureStore.getItemAsync(PUSH_TOKEN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPushPayload>;
    const token = typeof parsed.fcm_token === 'string' ? parsed.fcm_token.trim() : '';
    if (!token) return null;
    return {
      fcm_token: token,
      platform: normalizePlatform(parsed.platform),
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

async function saveCachedPushToken(fcm_token: string, platform: 'android' | 'ios' | 'unknown'): Promise<void> {
  try {
    const payload: CachedPushPayload = {
      fcm_token,
      platform,
      savedAt: Date.now(),
    };
    await SecureStore.setItemAsync(PUSH_TOKEN_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[push] could not cache push token locally', e);
  }
}

/** Clears the last saved device push token (e.g. on logout). */
export async function clearCachedPushToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_CACHE_KEY);
  } catch {
    /* no key */
  }
}

/**
 * Remote push is disabled in Expo Go from SDK 53+. Use `expo run:android` / dev client / EAS builds.
 * Prefer `executionEnvironment` over deprecated `appOwnership` (bare + prebuild reports `appOwnership: null`).
 */
export function canUseRemotePushRuntime(): boolean {
  if (Platform.OS === 'web') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    console.warn(
      '[push] Running in Expo Go — remote push tokens are not supported from SDK 53. ' +
        'Use: npx expo run:android (or ios), or an EAS development/preview build.',
    );
    return false;
  }
  return true;
}

/**
 * Resolve the EAS project ID — required only for iOS (Expo push token).
 */
function resolveProjectId(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PROJECT_ID?.trim();
  if (fromEnv) return fromEnv;

  const easConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig;
  const fromEasConfig = easConfig?.projectId?.trim();
  if (fromEasConfig) return fromEasConfig;

  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromExtra = extra?.eas?.projectId?.trim();
  if (fromExtra) return fromExtra;

  throw new Error(
    '[push] Expo project ID not found for iOS push; set extra.eas.projectId or EXPO_PUBLIC_PROJECT_ID.',
  );
}

/** iOS Simulator cannot obtain push tokens; Android emulators with Play Services can use FCM. */
function pushRuntimeSupportsThisDevice(): boolean {
  if (Platform.OS === 'ios' && !Device.isDevice) return false;
  return true;
}

async function requestNotificationPermissions(
  Notifications: typeof import('expo-notifications'),
): Promise<import('expo-notifications').PermissionStatus> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return existing;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return status;
}

async function configureAndroidChannels(Notifications: typeof import('expo-notifications')): Promise<void> {
  await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL, {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(ANDROID_BILLING_CHANNEL, {
    name: 'Billing & Fee Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(ANDROID_REMINDERS_CHANNEL, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

/**
 * Obtains native FCM registration token on Android; Expo push token on iOS (same column / API field `fcm_token`).
 */
async function resolveStoredPushToken(Notifications: typeof import('expo-notifications')): Promise<
  string | null
> {
  if (Platform.OS === 'android') {
    const device = await Notifications.getDevicePushTokenAsync();
    return device.data?.trim() || null;
  }

  let projectId: string;
  try {
    projectId = resolveProjectId();
  } catch (e) {
    console.error((e as Error).message);
    return null;
  }
  const expo = await Notifications.getExpoPushTokenAsync({ projectId });
  return expo.data?.trim() || null;
}

let handlerConfigured = false;
let lastRegisteredApiToken: string | null = null;
let lastRegisteredPushToken: string | null = null;

/**
 * Silently obtain push token without API call — used at login (`fcm_token` request field).
 */
export async function getDevicePushToken(): Promise<{
  fcm_token: string;
  platform: 'android' | 'ios' | 'unknown';
} | null> {
  if (!canUseRemotePushRuntime() || !pushRuntimeSupportsThisDevice()) return null;
  try {
    const Notifications = await import('expo-notifications');

    const finalStatus = await requestNotificationPermissions(Notifications);
    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') await configureAndroidChannels(Notifications);

    let token = await resolveStoredPushToken(Notifications);
    let platform: 'android' | 'ios' | 'unknown' =
      Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'unknown';

    if (!token) {
      const cached = await loadCachedPushToken();
      if (cached?.fcm_token) {
        console.info('[push] using locally cached push token (live token unavailable this run)');
        token = cached.fcm_token;
        platform = cached.platform;
      }
    }

    if (!token) return null;

    await saveCachedPushToken(token, platform);

    return { fcm_token: token, platform };
  } catch (error) {
    console.warn('[push] failed to get device push token before login', error);
    return null;
  }
}

export async function configurePushNotificationHandler(): Promise<void> {
  if (!canUseRemotePushRuntime()) return;
  if (handlerConfigured) return;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    handlerConfigured = true;
  } catch {
    /* native module unavailable */
  }
}

/**
 * Registers device token after login — Android sends raw FCM; iOS sends ExponentPushToken[…].
 */
export async function registerStudentPushToken(apiToken: string): Promise<void> {
  if (!canUseRemotePushRuntime() || !pushRuntimeSupportsThisDevice()) return;
  if (!apiToken) return;
  try {
    const Notifications = await import('expo-notifications');

    const finalStatus = await requestNotificationPermissions(Notifications);
    if (finalStatus !== 'granted') {
      console.info('[push] notification permission not granted');
      return;
    }

    if (Platform.OS === 'android') await configureAndroidChannels(Notifications);

    let pushToken = await resolveStoredPushToken(Notifications);
    let platform: 'android' | 'ios' | 'unknown' =
      Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'unknown';

    if (!pushToken) {
      const cached = await loadCachedPushToken();
      if (cached?.fcm_token) {
        console.info('[push] registering cached push token with API');
        pushToken = cached.fcm_token;
        platform = cached.platform;
      }
    }

    if (!pushToken) {
      console.warn('[push] no device push token (FCM / Expo)');
      return;
    }

    await saveCachedPushToken(pushToken, platform);

    if (lastRegisteredApiToken === apiToken && lastRegisteredPushToken === pushToken) return;

    let saved = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await studentRegisterDeviceToken(apiToken, pushToken, platform);
        lastRegisteredApiToken = apiToken;
        lastRegisteredPushToken = pushToken;
        saved = true;
        break;
      } catch (error) {
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        else console.warn('[push] failed to register token with backend', error);
      }
    }

    if (!saved) console.info('[push] token registration not saved');
  } catch (error) {
    console.warn('[push] token registration failed before API call', error);
  }
}

let devLocalPushSelfTestScheduled = false;

/**
 * Prompts for notification permission as soon as the app mounts (dev / production),
 * caches the FCM / Expo push token in SecureStore, and in __DEV__ schedules one local
 * notification so you can confirm the pipeline on device or emulator.
 */
export async function bootstrapPushNotificationsEarly(): Promise<void> {
  if (!canUseRemotePushRuntime() || !pushRuntimeSupportsThisDevice()) return;
  try {
    const Notifications = await import('expo-notifications');

    const finalStatus = await requestNotificationPermissions(Notifications);
    if (finalStatus !== 'granted') {
      console.info('[push] bootstrap: notification permission not granted yet');
      return;
    }

    if (Platform.OS === 'android') await configureAndroidChannels(Notifications);

    let pushToken = await resolveStoredPushToken(Notifications);
    let platform: 'android' | 'ios' | 'unknown' =
      Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'unknown';

    if (!pushToken) {
      const cached = await loadCachedPushToken();
      if (cached?.fcm_token) {
        pushToken = cached.fcm_token;
        platform = cached.platform;
      }
    }

    if (pushToken) await saveCachedPushToken(pushToken, platform);

    if (__DEV__ && pushToken && !devLocalPushSelfTestScheduled) {
      devLocalPushSelfTestScheduled = true;
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Notifications (dev check)',
            body: `Local channel OK. Token: ${pushToken.slice(0, 28)}…`,
            data: { screen: 'Dashboard' },
          },
          trigger: null,
        });
      } catch (e) {
        console.warn('[push] dev local notification failed', e);
      }
    }
  } catch (e) {
    console.warn('[push] bootstrap failed', e);
  }
}
