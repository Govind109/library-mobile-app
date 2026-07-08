import { useAuth } from '@/context/AuthContext';
import { StudentAppModeProvider, useStudentAppMode } from '@/context/StudentAppModeContext';
import { TabAppOpenAdListener } from '@/components/TabAppOpenAdListener';
import { BrandedTabHeader } from '@/components/BrandedTabHeader';
import { StudentModeSwitch } from '@/components/StudentModeSwitch';
import { palette } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabBarIcon(props) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const { token, ready, student, library, studentPreferredMode } = useAuth();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  const libraryConnected = Boolean(library || student?.library);

  return (
    <StudentAppModeProvider initialMode={studentPreferredMode}>
      <StudentTabs libraryConnected={libraryConnected} />
    </StudentAppModeProvider>
  );
}

function StudentTabs({ libraryConnected }) {
  const insets = useSafeAreaInsets();
  const { studentMode } = useStudentAppMode();

  const headerCommon = {
    headerStyle: styles.header,
    headerShadowVisible: false,
    headerTintColor: palette.onPrimary,
    headerTitleAlign: 'left',
    headerTitleContainerStyle: styles.headerTitleContainer,
    headerRight: () => <StudentModeSwitch />,
  };

  return (
    <>
      <TabAppOpenAdListener />
      <Tabs
        tabBar={(props) => (
          <View style={styles.tabBarWrap}>
            <BottomTabBar {...props} />
          </View>
        )}
        screenOptions={{
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.tabInactive,
          tabBarActiveBackgroundColor: palette.primarySoft,
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: [
            styles.tabBar,
            {
              height: 58 + Math.max(insets.bottom, Platform.OS === 'ios' ? 28 : 12),
              paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 28 : 12),
            },
          ],
          tabBarItemStyle: styles.tabItem,
          headerShown: true,
          ...headerCommon,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            headerTitle: () => <BrandedTabHeader screenTitle={studentMode === 'library' ? 'My Library' : 'Self Study'} />,
            title: studentMode === 'library' ? 'Library' : 'Study',
            tabBarIcon: ({ color }) => <TabBarIcon name={studentMode === 'library' ? 'building-o' : 'gamepad'} color={color} />,
          }}
        />
        <Tabs.Screen
          name="syllabus"
          options={{
            href: studentMode === 'study' ? undefined : null,
            headerTitle: () => <BrandedTabHeader screenTitle="Syllabus" />,
            title: 'Syllabus',
            tabBarIcon: ({ color }) => <TabBarIcon name="book" color={color} />,
          }}
        />
        <Tabs.Screen
          name="study-dates"
          options={{
            href: studentMode === 'study' ? undefined : null,
            headerTitle: () => <BrandedTabHeader screenTitle="Dates" />,
            title: 'Dates',
            tabBarIcon: ({ color }) => <TabBarIcon name="calendar-check-o" color={color} />,
          }}
        />
        <Tabs.Screen
          name="study-profile"
          options={{
            href: studentMode === 'study' ? undefined : null,
            headerTitle: () => <BrandedTabHeader screenTitle="Study Profile" />,
            title: 'Profile',
            tabBarIcon: ({ color }) => <TabBarIcon name="user-circle" color={color} />,
          }}
        />
        <Tabs.Screen
          name="attendance"
          options={{
            href: libraryConnected && studentMode === 'library' ? undefined : null,
            headerTitle: () => <BrandedTabHeader screenTitle="Attendance" />,
            title: 'Attendance',
            tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="fees"
          options={{
            href: libraryConnected && studentMode === 'library' ? undefined : null,
            headerTitle: () => <BrandedTabHeader screenTitle="Fees" />,
            title: 'Fees',
            tabBarIcon: ({ color }) => <TabBarIcon name="money" color={color} />,
          }}
        />
        <Tabs.Screen
          name="notices"
          options={{
            href: libraryConnected && studentMode === 'library' ? undefined : null,
            headerTitle: () => <BrandedTabHeader screenTitle="Notices" />,
            title: 'Notices',
            tabBarIcon: ({ color }) => <TabBarIcon name="bell" color={color} />,
          }}
        />
        <Tabs.Screen name="libraries" options={{ href: null }} />
        <Tabs.Screen
          name="profile"
          options={{
            href: libraryConnected && studentMode === 'library' ? undefined : null,
            title: 'Profile',
            headerShown: false,
            tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.canvas,
  },
  header: {
    backgroundColor: palette.headerBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    minHeight: 72,
  },
  headerTitleContainer: {
    maxWidth: '48%',
    width: '48%',
  },
  tabBar: {
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    paddingTop: 6,
  },
  tabBarWrap: {
    backgroundColor: palette.surface,
  },
  tabItem: {
    borderRadius: 16,
    marginHorizontal: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
