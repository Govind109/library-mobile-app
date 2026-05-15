import { IndianPhoneField } from '@/components/IndianPhoneField';
import { ScreenWithBanner } from '@/components/ScreenWithBanner';
import { useAuth } from '@/context/AuthContext';
import { ApiError, studentUpdateProfile } from '@/lib/api/studentApi';
import {
  input,
  layout,
  palette,
  primaryButton,
  primaryButtonText,
  typography,
} from '@/constants/Theme';
import { isValidIndianMobile, parseStoredIndianMobile } from '@/lib/indianPhone';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const PREPARATION_OPTIONS = [
  'SSC',
  'NEET',
  'IIT-JEE',
  'Railways',
  'Banking',
  'UPSC',
  'State PSC',
  'CAT',
];

export default function EditProfileScreen() {
  const router = useRouter();
  const { token, student, refreshMe } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [preparation, setPreparation] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!student) return;
    setName(student.name ?? '');
    setPhone(parseStoredIndianMobile(student.phone));
    setAddress(student.address ?? '');
    setCity(student.city ?? '');
    setState(student.state ?? '');
    setPincode(String(student.pincode ?? '').replace(/\D/g, '').slice(0, 6));
    setParentName(student.parent_name ?? '');
    setParentPhone(parseStoredIndianMobile(student.parent_phone));
    setPreparation(student.preparation ?? '');
  }, [student]);

  async function onSave() {
    if (!token) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    if (phone && !isValidIndianMobile(phone)) {
      Alert.alert('Validation', 'Phone: enter 10 digits starting with 6–9, or leave blank.');
      return;
    }
    if (parentPhone && !isValidIndianMobile(parentPhone)) {
      Alert.alert('Validation', 'Parent phone: enter 10 digits starting with 6–9, or leave blank.');
      return;
    }
    setBusy(true);
    try {
      await studentUpdateProfile(token, {
        name: trimmed,
        phone: phone || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pincode: pincode.trim() || null,
        parent_name: parentName.trim() || null,
        parent_phone: parentPhone || null,
        preparation: preparation.trim() || null,
      });
      await refreshMe();
      Alert.alert('Saved', 'Your profile was updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not save.';
      Alert.alert('Error', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenWithBanner>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Field label="Full name *" value={name} onChangeText={setName} />
        <IndianPhoneField label="Phone" value={phone} onChangeDigits={setPhone} />
        <Field label="Address" value={address} onChangeText={setAddress} multiline />
        <Field label="City" value={city} onChangeText={setCity} />
        <Field label="State" value={state} onChangeText={setState} />
        <Field
          label="Pincode"
          value={pincode}
          onChangeText={(t) => setPincode(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
        />
        <Field label="Parent name" value={parentName} onChangeText={setParentName} />
        <IndianPhoneField label="Parent phone" value={parentPhone} onChangeDigits={setParentPhone} />
        <View style={styles.field}>
          <Text style={styles.label}>Preparing for</Text>
          <View style={styles.prepWrap}>
            {PREPARATION_OPTIONS.map((option) => {
              const active = preparation.trim().toLowerCase() === option.toLowerCase();
              return (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.prepChip,
                    active && styles.prepChipActive,
                    pressed && { opacity: 0.86 },
                  ]}
                  onPress={() => setPreparation(option)}>
                  <Text style={[styles.prepChipText, active && styles.prepChipTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={[input(), styles.prepCustomInput]}
            value={preparation}
            onChangeText={setPreparation}
            placeholder="Or type custom goal (e.g. CUET, CLAT)"
            placeholderTextColor={palette.textHint}
          />
        </View>

        <Pressable
          style={[primaryButton(), busy && styles.btnDisabled]}
          onPress={() => void onSave()}
          disabled={busy}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={primaryButtonText()}>Save changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </ScreenWithBanner>
  );
}

function Field(props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[input(), props.multiline && styles.inputMulti]}
        value={props.value}
        onChangeText={props.onChangeText}
        multiline={props.multiline}
        keyboardType={props.keyboardType}
        maxLength={props.maxLength}
        placeholderTextColor={palette.textHint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: layout.space.lg,
    paddingBottom: 40,
    backgroundColor: palette.canvas,
  },
  field: {
    marginBottom: layout.space.lg,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: layout.space.xs,
  },
  inputMulti: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  prepWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: layout.space.sm,
  },
  prepChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: layout.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  prepChipActive: {
    backgroundColor: palette.primarySoft,
    borderColor: 'rgba(26, 54, 124, 0.26)',
  },
  prepChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  prepChipTextActive: {
    color: palette.primaryDark,
  },
  prepCustomInput: {
    marginTop: layout.space.sm,
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
