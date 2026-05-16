import { BrandedTabHeader } from '@/components/BrandedTabHeader';
import { palette } from '@/constants/Theme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

export default function ProfileStackLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
        headerTintColor: palette.onPrimary,
        headerBackTitle: '',
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: palette.onPrimary,
  },
});
