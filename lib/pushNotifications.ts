import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { studentRegisterDeviceToken } from '@/lib/api/studentApi';

const ANDROID_DEFAULT_CHANNEL = 'default';
const ANDROID_REMINDERS_CHANNEL = 'reminders';
const ANDROID_BILLING_CHANNEL = 'billing';

const PUSH_TOKEN_CACHE_KEY = 'student_local_push_token_v1';
const STUDY_NUDGE_IDS_KEY = 'student_study_nudge_ids_v1';

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

type StudySubject = {
  title?: string;
  chapters?: Array<{
    title?: string;
    done?: boolean;
    next_revision_date?: string | null;
  }>;
};

type StudySyllabus = {
  title?: string;
  subjects?: StudySubject[];
};

type ImportantDate = {
  title?: string;
  date?: string | null;
  type?: string | null;
};

type StudyProfile = {
  reading_streak?: number;
  syllabus_progress?: number;
  today_minutes?: number;
  exam_name?: string | null;
  exam_date?: string | null;
  physical_training_date?: string | null;
  important_dates?: ImportantDate[];
  syllabi?: StudySyllabus[];
  subjects?: StudySubject[];
};

function localYmd(): string {
  const d = new Date();
  const p = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysUntilYmd(value?: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  if (target.getFullYear() !== year || target.getMonth() !== month - 1 || target.getDate() !== day) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function importantDatesFromProfile(profile: StudyProfile): ImportantDate[] {
  if (Array.isArray(profile.important_dates) && profile.important_dates.length) {
    return profile.important_dates.filter((item) => item.title && item.date);
  }
  const dates: ImportantDate[] = [];
  if (profile.exam_date) {
    dates.push({ title: profile.exam_name || 'Exam', date: profile.exam_date, type: 'exam' });
  }
  if (profile.physical_training_date) {
    dates.push({ title: 'Physical training', date: profile.physical_training_date, type: 'physical' });
  }
  return dates;
}

function nearestImportantDate(profile: StudyProfile): (ImportantDate & { days: number }) | null {
  return importantDatesFromProfile(profile)
    .map((item) => ({ ...item, days: daysUntilYmd(item.date) }))
    .filter((item): item is ImportantDate & { days: number } => item.days !== null && item.days >= 0)
    .sort((a, b) => a.days - b.days)[0] || null;
}

function studyNudgeBodies(profile: StudyProfile): string[] {
  const subjects = Array.isArray(profile.syllabi) && profile.syllabi.length
    ? profile.syllabi.flatMap((syllabus) => (Array.isArray(syllabus.subjects) ? syllabus.subjects : []))
    : Array.isArray(profile.subjects) ? profile.subjects : [];
  const today = localYmd();
  const subjectStats = subjects.map((subject) => {
    const chapters = Array.isArray(subject.chapters) ? subject.chapters : [];
    const done = chapters.filter((chapter) => chapter.done).length;
    const due = chapters.filter((chapter) => chapter.next_revision_date && chapter.next_revision_date <= today).length;
    return {
      title: String(subject.title || 'subject').trim() || 'subject',
      total: chapters.length,
      done,
      due,
    };
  });
  const weak = subjectStats
    .filter((subject) => subject.total > 0)
    .sort((a, b) => (a.done / Math.max(1, a.total)) - (b.done / Math.max(1, b.total)))[0];
  const due = subjectStats.find((subject) => subject.due > 0);
  const onlySubject = subjectStats.length === 1 ? subjectStats[0] : null;
  const streak = Number(profile.reading_streak ?? 0);
  const progress = Number(profile.syllabus_progress ?? 0);
  const nearestDate = nearestImportantDate(profile);
  const messages = [
    'Hero entry tabhi hogi jab aaj ka chapter complete hoga. Chalo, scene shuru karo.',
    'Bas 15 minute padh lo. Picture abhi baaki hai, champion.',
    'Aaj ka comeback scene ready hai. Ek chapter tick karo aur XP le jao.',
  ];

  if (nearestDate) {
    const text = nearestDate.days === 0 ? 'aaj' : nearestDate.days === 1 ? 'kal' : `${nearestDate.days} din mein`;
    const title = String(nearestDate.title || 'Important date').trim() || 'Important date';
    messages.unshift(`${title} ${text} hai. Ab hero wali mehnat, villain wali distraction band.`);
  }
  if (due) {
    messages.unshift(`${due.title} revision due hai. Bhai, interval ke baad story bhoolni nahi.`);
  }
  if (weak) {
    messages.unshift(`${weak.title} thoda villain ban raha hai. Aaj isko hero wali entry do.`);
  }
  if (onlySubject) {
    messages.unshift(`Khali ${onlySubject.title} padhke exam nikal loge kya? Thoda balance bhi chahiye, boss.`);
  }
  if (streak <= 0) {
    messages.unshift('Streak zero? Koi nahi. Aaj se apni blockbuster comeback story start.');
  } else if (streak >= 7) {
    messages.unshift(`${streak} din ki winning streak chal rahi hai. Isko flop mat hone do.`);
  }
  if (progress >= 70) {
    messages.unshift(`Syllabus ${progress}% complete. Climax paas hai, rukna mana hai.`);
  }

  return messages;
}

export async function scheduleSelfStudyNudges(profile: StudyProfile): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    const finalStatus = await requestNotificationPermissions(Notifications);
    if (finalStatus !== 'granted') return;
    if (Platform.OS === 'android') await configureAndroidChannels(Notifications);

    const previousRaw = await SecureStore.getItemAsync(STUDY_NUDGE_IDS_KEY);
    if (previousRaw) {
      try {
        const ids = JSON.parse(previousRaw);
        if (Array.isArray(ids)) {
          await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(String(id))));
        }
      } catch {
        /* ignore invalid cache */
      }
    }

    const bodies = studyNudgeBodies(profile);
    const offsets = [2 * 60 * 60, 7 * 60 * 60, 24 * 60 * 60];
    const ids: string[] = [];
    for (let i = 0; i < offsets.length; i += 1) {
      const body = bodies[i % bodies.length];
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'KYPS Study Reminder',
          body,
          sound: 'default',
          data: { screen: 'Dashboard', type: 'self_study_nudge' },
        },
        trigger: {
          seconds: offsets[i],
          channelId: ANDROID_REMINDERS_CHANNEL,
        },
      });
      ids.push(id);
    }
    await SecureStore.setItemAsync(STUDY_NUDGE_IDS_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn('[push] self-study nudges failed', e);
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
