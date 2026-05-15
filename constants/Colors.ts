import { palette } from '@/constants/Theme';

const tintColorLight = palette.primary;
const tintColorDark = '#fff';

export default {
  light: {
    text: palette.text,
    background: palette.canvas,
    tint: tintColorLight,
    tabIconDefault: palette.tabInactive,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
  },
};
