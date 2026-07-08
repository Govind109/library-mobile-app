import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { AdMobBootstrap } from '@/components/AdMobBootstrap';
import { CustomAlertProvider } from '@/components/CustomAlertProvider';
import { DailyDueAlert } from '@/components/DailyDueAlert';
import { AuthProvider } from '@/context/AuthContext';
import { palette } from '@/constants/Theme';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  bootstrapPushNotificationsEarly,
  configurePushNotificationHandler,
  canUseRemotePushRuntime,
} from '@/lib/pushNotifications';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

export { ErrorBoundary } from 'expo-router';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: palette.primary,
    background: palette.canvas,
    card: palette.surface,
    text: palette.text,
    border: palette.borderSubtle,
    notification: palette.primary,
  },
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

const SCREEN_ROUTES = {
  Fees: '/(tabs)/fees',
  Notices: '/(tabs)/notices',
  Notice: '/(tabs)/notices',   // backend sendNotice uses singular 'Notice'
  Attendance: '/(tabs)/attendance',
  Dashboard: '/(tabs)/',
};

function RootLayoutNav() {
  const router = useRouter();
  const subRef = useRef(null);

  useEffect(() => {
    void configurePushNotificationHandler();
    void bootstrapPushNotificationsEarly();

    if (!canUseRemotePushRuntime()) return;

    let mounted = true;
    (async () => {
      const Notifications = await import('expo-notifications');
      const navigateFromResponse = (response) => {
        const screen = response?.notification?.request?.content?.data?.screen;
        const route = screen ? SCREEN_ROUTES[screen] : null;
        if (route && mounted) {
          router.push(route);
        }
      };

      // Handle notification tap that launched the app from a killed state.
      const initialResponse = await Notifications.getLastNotificationResponseAsync();
      if (initialResponse) {
        navigateFromResponse(initialResponse);
      }

      // Handle taps on notifications while the app is foregrounded or backgrounded.
      subRef.current = Notifications.addNotificationResponseReceivedListener(navigateFromResponse);
    })();

    return () => {
      mounted = false;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [router]);

  return (
    <ThemeProvider value={navigationTheme}>
      <AuthProvider>
        <CustomAlertProvider>
          <AdMobBootstrap />
          <DailyDueAlert />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen
              name="libraries"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="library-detail"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="student-tools" options={{ headerShown: false }} />
          </Stack>
        </CustomAlertProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
