import { formatIndianMobileDisplay, indianMobileDigitsOnly, isValidIndianMobile } from '@/lib/indianPhone';
import { input, layout, palette, typography } from '@/constants/Theme';
import { StyleSheet, Text, TextInput, View } from 'react-native';

const FLAG_W = 24;
const FLAG_H = 17;

function IndiaFlagIcon() {
  const h = FLAG_H / 3;
  return (
    <View style={styles.flagWrap} accessibilityLabel="India" accessible accessibilityRole="image">
      <View style={[styles.flagStripe, { height: h, backgroundColor: '#FF9933' }]} />
      <View style={[styles.flagStripe, { height: h, backgroundColor: '#FFFFFF' }]} />
      <View style={[styles.flagStripe, { height: h, backgroundColor: '#138808' }]} />
    </View>
  );
}

type IndianPhoneFieldProps = {
  label: string;
  value: string;
  onChangeDigits: (digits: string) => void;
  placeholder?: string;
};

/** Fixed India (+91) with flag; stores up to 10 national digits. */
export function IndianPhoneField({ label, value, onChangeDigits, placeholder = '10-digit mobile' }: IndianPhoneFieldProps) {
  const digits = indianMobileDigitsOnly(value);
  const showInvalid = digits.length === 10 && !isValidIndianMobile(digits);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.shell, showInvalid && styles.shellInvalid]}>
        <IndiaFlagIcon />
        <Text style={styles.code}>+91</Text>
        <TextInput
          style={styles.input}
          value={formatIndianMobileDisplay(digits)}
          onChangeText={(t) => onChangeDigits(indianMobileDigitsOnly(t))}
          keyboardType="number-pad"
          placeholder={placeholder}
          placeholderTextColor={palette.textHint}
        />
      </View>
      {digits.length > 0 ? (
        <Text style={[styles.preview, showInvalid && styles.previewError]}>
          {showInvalid ? 'Enter 10 digits starting with 6–9' : `${digits.length}/10 digits`}
        </Text>
      ) : (
        <Text style={styles.hint}>10 digits, starts with 6–9</Text>
      )}
    </View>
  );
}

const shellBase = input();

const styles = StyleSheet.create({
  field: {
    marginBottom: layout.space.lg,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: layout.space.xs,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: shellBase.backgroundColor,
    borderWidth: shellBase.borderWidth,
    borderColor: shellBase.borderColor,
    borderRadius: shellBase.borderRadius,
    paddingLeft: 10,
    paddingRight: 14,
    minHeight: 48,
  },
  shellInvalid: {
    borderColor: '#dc2626',
  },
  flagWrap: {
    width: FLAG_W,
    height: FLAG_H,
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  flagStripe: {
    width: '100%',
  },
  code: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.textSecondary,
    marginRight: 8,
    letterSpacing: -0.2,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 0,
    fontSize: 16,
    letterSpacing: 0.5,
    color: palette.text,
  },
  preview: {
    ...typography.micro,
    marginTop: layout.space.xs,
    color: palette.textMuted,
    letterSpacing: 0.3,
  },
  previewError: {
    color: '#dc2626',
    fontWeight: '600',
  },
  hint: {
    ...typography.micro,
    marginTop: layout.space.xs,
    color: palette.textHint,
  },
});
