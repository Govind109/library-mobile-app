import { useAuth } from '@/context/AuthContext';
import { TabAppOpenAdListener } from '@/components/TabAppOpenAdListener';
import { BrandedTabHeader } from '@/components/BrandedTabHeader';
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
  const { token, ready } = useAuth();
  const insets = useSafeAreaInsets();

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
        <Tabs.Screen name="libraries" options={{ href: null }} />
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
