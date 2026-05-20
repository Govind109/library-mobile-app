import { BrandedTabHeader } from '@/components/BrandedTabHeader';
import { palette } from '@/constants/Theme';
import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

export default function ProfileStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
        headerTintColor: palette.onPrimary,
        headerBackTitle: '',
        contentStyle: { backgroundColor: palette.canvas },
      }}>
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <BrandedTabHeader screenTitle="Profile" />,
        }}
      />
      <Stack.Screen
        name="edit"
        options={{
          headerTitle: () => <BrandedTabHeader screenTitle="Edit profile" />,
        }}
      />
      <Stack.Screen
        name="password"
        options={{
          headerTitle: () => <BrandedTabHeader screenTitle="Change password" />,
        }}
      />
      <Stack.Screen
        name="id-card"
        options={{
          headerTitle: () => <BrandedTabHeader screenTitle="Digital ID" />,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: palette.headerBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    minHeight: 72,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: palette.onPrimary,
  },
});
