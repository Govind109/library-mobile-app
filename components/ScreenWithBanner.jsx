import { AdsBannerRow } from '@/components/AdsBannerRow';
import { StyleSheet, View } from 'react-native';

/**
 * Screen container that renders the banner ad immediately below the
 * navigation header, followed by the screen body. Used by all tab screens.
 */
export function ScreenWithBanner({ children }) {
  return (
    <View style={styles.root}>
      <AdsBannerRow />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});
