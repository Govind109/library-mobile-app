import { useAuth } from '@/context/AuthContext';
import { TabAppOpenAdListener } from '@/components/TabAppOpenAdListener';
import { BrandedTabHeader } from '@/components/BrandedTabHeader';
import { palette } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabBarIcon(props) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const { token, ready } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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

  const headerCommon = {
    headerStyle: styles.header,
    headerShadowVisible: false,
    headerTintColor: palette.onPrimary,
    headerTitleAlign: 'left',
    headerTitleContainerStyle: styles.headerTitleContainer,
    headerRight: () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Find libraries"
        onPress={() => router.push('/libraries')}
        style={({ pressed }) => [styles.headerAction, pressed && styles.headerActionPressed]}>
        <FontAwesome name="search" size={18} color={palette.onPrimary} />
      </Pressable>
    ),
    headerRightContainerStyle: styles.headerRightContainer,
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
            headerTitle: () => <BrandedTabHeader screenTitle="Dashboard" />,
            title: 'Dashboard',
            tabBarIcon: ({ color }) => <TabBarIcon name="th-large" color={color} />,
          }}
        />
        <Tabs.Screen
          name="attendance"
          options={{
            headerTitle: () => <BrandedTabHeader screenTitle="Attendance" />,
            title: 'Attendance',
            tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="fees"
          options={{
            headerTitle: () => <BrandedTabHeader screenTitle="Fees" />,
            title: 'Fees',
            tabBarIcon: ({ color }) => <TabBarIcon name="money" color={color} />,
          }}
        />
        <Tabs.Screen
          name="notices"
          options={{
            headerTitle: () => <BrandedTabHeader screenTitle="Notices" />,
            title: 'Notices',
            tabBarIcon: ({ color }) => <TabBarIcon name="bell" color={color} />,
          }}
        />
        <Tabs.Screen
          name="libraries"
          options={{
            href: null,
            headerTitle: () => <BrandedTabHeader screenTitle="Libraries" />,
            title: 'Libraries',
            tabBarIcon: ({ color }) => <TabBarIcon name="building" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
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
    maxWidth: '78%',
    width: '78%',
  },
  headerRightContainer: {
    paddingRight: 14,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  headerActionPressed: {
    opacity: 0.75,
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
