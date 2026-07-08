import { layout, palette, typography } from "@/constants/Theme";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api/studentApi";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FEATURES = [
  { icon: "fire", label: "Study streak" },
  { icon: "book", label: "Syllabus" },
  { icon: "building-o", label: "My library" },
];

function AnimatedField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  editable,
  focused,
  onFocus,
  onBlur,
  returnKeyType,
  onSubmitEditing,
  trailing,
  delay,
  fieldRef,
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const focusAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 480,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: focused ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [focused, focusAnim]);

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(15,23,42,0.08)", "rgba(37,99,235,0.55)"],
  });
  const bgColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#f8fbff", "#ffffff"],
  });
  const shadowOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.12],
  });

  return (
    <Animated.View
      ref={fieldRef}
      collapsable={false}
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
        marginBottom: layout.space.md,
      }}
    >
      <Text style={styles.fieldLabel}>{label}</Text>
      <Animated.View
        style={[
          styles.inputShell,
          {
            borderColor,
            backgroundColor: bgColor,
            shadowOpacity,
          },
        ]}
      >
        <View style={[styles.inputIconBubble, focused && styles.inputIconBubbleActive]}>
          <FontAwesome name={icon} size={14} color={focused ? "#fff" : palette.primary} />
        </View>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textHint}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize="none"
          editable={editable}
          onFocus={onFocus}
          onBlur={onBlur}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
        />
        {trailing}
      </Animated.View>
    </Animated.View>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, ready, emailStudentAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [focusedField, setFocusedField] = useState(null);

  const scrollRef = useRef(null);
  const scrollContentRef = useRef(null);
  const emailFieldRef = useRef(null);
  const passwordFieldRef = useRef(null);
  const heroAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const heroCompress = useRef(new Animated.Value(0)).current;
  const logoPulse = useRef(new Animated.Value(0)).current;
  const orbOne = useRef(new Animated.Value(0)).current;
  const orbTwo = useRef(new Animated.Value(0)).current;
  const orbThree = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardAnim, {
        toValue: 1,
        delay: 220,
        friction: 9,
        tension: 55,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    const floatOrb = (value, duration) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

    floatOrb(orbOne, 4200).start();
    floatOrb(orbTwo, 5200).start();
    floatOrb(orbThree, 4800).start();
  }, [cardAnim, heroAnim, logoPulse, orbOne, orbTwo, orbThree]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      Animated.timing(heroCompress, {
        toValue: 1,
        duration: Platform.OS === "ios" ? event.duration || 250 : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      Animated.timing(heroCompress, {
        toValue: 0,
        duration: Platform.OS === "ios" ? event?.duration || 220 : 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [heroCompress]);

  useEffect(() => {
    if (!error) return;
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [error, shakeAnim]);

  async function onSubmitStudentEmail() {
    setError(null);
    setBusy(true);
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.97, duration: 90, useNativeDriver: true }),
      Animated.spring(btnScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    try {
      await emailStudentAuth({
        email: email.trim(),
        password: emailPassword,
      });
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not complete sign in.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(email.trim() && emailPassword.length >= 8) && !busy;

  function scrollToField(fieldRef) {
    requestAnimationFrame(() => {
      if (!fieldRef.current || !scrollContentRef.current || !scrollRef.current) return;

      fieldRef.current.measureLayout(
        scrollContentRef.current,
        (_left, top, _width, height) => {
          scrollRef.current?.scrollTo({
            y: Math.max(0, top - 12),
            animated: true,
          });
        },
        () => {},
      );
    });
  }

  function focusField(field, fieldRef) {
    setFocusedField(field);
    setTimeout(() => scrollToField(fieldRef), Platform.OS === "android" ? 120 : 60);
  }

  if (ready && token) {
    return <Redirect href="/(tabs)" />;
  }

  const heroOpacity = heroAnim;
  const heroY = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const cardY = cardAnim.interpolate({ inputRange: [0, 1], outputRange: [48, 0] });
  const cardOpacity = cardAnim;
  const logoScale = logoPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const logoRingOpacity = logoPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  const shakeX = shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });

  const orbOneY = orbOne.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const orbTwoY = orbTwo.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });
  const orbThreeX = orbThree.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });

  const heroHeight = heroCompress.interpolate({
    inputRange: [0, 1],
    outputRange: [280, 72],
  });
  const heroContentOpacity = heroCompress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.2, 0],
  });

  return (
    <View style={styles.shell}>
      <StatusBar style="light" />
      <View style={styles.bgGradient} pointerEvents="none" />
      <View style={styles.bgGlow} pointerEvents="none" />

      <Animated.View style={[styles.bgOrb, styles.bgOrbOne, { transform: [{ translateY: orbOneY }] }]} />
      <Animated.View style={[styles.bgOrb, styles.bgOrbTwo, { transform: [{ translateY: orbTwoY }] }]} />
      <Animated.View style={[styles.bgOrb, styles.bgOrbThree, { transform: [{ translateX: orbThreeX }] }]} />

      <View style={[styles.statusBarCover, { height: insets.top }]} pointerEvents="none" />

      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <ScrollView
          ref={scrollRef}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + layout.space.lg },
          ]}
        >
          <View ref={scrollContentRef} collapsable={false}>
          <Animated.View
            style={[
              styles.heroWrap,
              {
                height: heroHeight,
                opacity: heroContentOpacity,
              },
            ]}
          >
          <Animated.View
            style={[
              styles.hero,
              {
                paddingTop: layout.space.lg,
                opacity: heroOpacity,
                transform: [{ translateY: heroY }],
              },
            ]}
          >
            <View style={styles.logoWrap}>
              <Animated.View style={[styles.logoRing, { opacity: logoRingOpacity, transform: [{ scale: logoScale }] }]} />
              <Animated.View style={[styles.logoCore, { transform: [{ scale: logoScale }] }]}>
                <Image source={require("../assets/images/icon.png")} style={styles.logoImage} resizeMode="contain" />
              </Animated.View>
            </View>

            <Text style={styles.brandName}>KYPS Library</Text>
            <Text style={styles.brandTag}>Your study companion — streaks, syllabus & library in one place</Text>

            <View style={styles.featureRow}>
              {FEATURES.map((item, index) => (
                <Animated.View
                  key={item.label}
                  style={[
                    styles.featureChip,
                    {
                      opacity: heroAnim,
                      transform: [
                        {
                          translateY: heroAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [12 + index * 4, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <FontAwesome name={item.icon} size={11} color="#dbeafe" />
                  <Text style={styles.featureChipText}>{item.label}</Text>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
          </Animated.View>

          <Animated.View style={{ transform: [{ translateY: cardY }] }}>
          <Animated.View style={[styles.formSheet, { opacity: cardOpacity }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetKicker}>Student sign in</Text>
                <Text style={styles.sheetTitle}>Welcome back</Text>
              </View>
              <View style={styles.sheetBadge}>
                <FontAwesome name="shield" size={14} color={palette.primary} />
              </View>
            </View>

            <AnimatedField
              fieldRef={emailFieldRef}
              label="Email"
              icon="envelope-o"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              editable={!busy}
              focused={focusedField === "email"}
              onFocus={() => focusField("email", emailFieldRef)}
              onBlur={() => setFocusedField((f) => (f === "email" ? null : f))}
              keyboardType="email-address"
              delay={320}
            />

            <AnimatedField
              fieldRef={passwordFieldRef}
              label="Password"
              icon="lock"
              value={emailPassword}
              onChangeText={setEmailPassword}
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
              editable={!busy}
              focused={focusedField === "password"}
              onFocus={() => focusField("password", passwordFieldRef)}
              onBlur={() => setFocusedField((f) => (f === "password" ? null : f))}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (canSubmit) void onSubmitStudentEmail();
              }}
              delay={400}
              trailing={
                <Pressable hitSlop={12} onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                  <FontAwesome name={showPassword ? "eye-slash" : "eye"} size={16} color={palette.textMuted} />
                </Pressable>
              }
            />

            {error ? (
              <Animated.View
                style={[
                  styles.errorBox,
                  { transform: [{ translateX: shakeX }] },
                ]}
                accessibilityLiveRegion="polite"
              >
                <FontAwesome name="exclamation-circle" size={15} color={palette.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <Pressable
                style={({ pressed }) => [
                  styles.submitWrap,
                  pressed && styles.btnPressed,
                  (!canSubmit || busy) && styles.btnDisabled,
                ]}
                onPress={() => void onSubmitStudentEmail()}
                disabled={!canSubmit}
              >
                <View style={[styles.submitGradient, !canSubmit && styles.submitGradientDisabled]}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.submitText}>Sign in</Text>
                      <FontAwesome name="arrow-right" size={14} color="#fff" />
                    </>
                  )}
                </View>
              </Pressable>
            </Animated.View>

            <View style={styles.trustRow}>
              <View style={styles.trustItem}>
                <FontAwesome name="lock" size={12} color={palette.textHint} />
                <Text style={styles.trustText}>Secure login</Text>
              </View>
              <View style={styles.trustDot} />
              <View style={styles.trustItem}>
                <FontAwesome name="graduation-cap" size={12} color={palette.textHint} />
                <Text style={styles.trustText}>Student only</Text>
              </View>
            </View>
          </Animated.View>
          </Animated.View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#040d24",
    overflow: "hidden",
  },
  bgGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a1a45",
  },
  bgGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    backgroundColor: "rgba(37,99,235,0.22)",
    borderBottomLeftRadius: 180,
    borderBottomRightRadius: 180,
  },
  flex: {
    flex: 1,
  },
  statusBarCover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "#0a1a45",
  },
  scrollContent: {
    flexGrow: 1,
  },
  bgOrb: {
    position: "absolute",
    borderRadius: 999,
  },
  bgOrbOne: {
    width: 280,
    height: 280,
    backgroundColor: "rgba(56, 189, 248, 0.18)",
    top: -90,
    right: -80,
  },
  bgOrbTwo: {
    width: 220,
    height: 220,
    backgroundColor: "rgba(45, 212, 191, 0.14)",
    bottom: 120,
    left: -90,
  },
  bgOrbThree: {
    width: 160,
    height: 160,
    backgroundColor: "rgba(147, 197, 253, 0.12)",
    top: "38%",
    right: -40,
  },
  heroWrap: {
    overflow: "hidden",
  },
  hero: {
    alignItems: "center",
    paddingHorizontal: layout.space.lg,
    paddingBottom: layout.space.xl,
  },
  logoWrap: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: layout.space.md,
  },
  logoRing: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  logoCore: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  logoImage: {
    width: 58,
    height: 58,
    borderRadius: 18,
  },
  brandName: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1.2,
    color: "#fff",
    textAlign: "center",
  },
  brandTag: {
    marginTop: 8,
    maxWidth: 300,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
  },
  featureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: layout.space.lg,
  },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  featureChipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#e2e8f0",
  },
  formSheet: {
    flex: 1,
    marginTop: -4,
    paddingHorizontal: layout.space.lg,
    paddingTop: layout.space.sm,
    paddingBottom: layout.space.lg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#ffffff",
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.10)",
    marginBottom: layout.space.md,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: layout.space.lg,
  },
  sheetKicker: {
    ...typography.overline,
    color: palette.primary,
    fontWeight: "900",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
    color: palette.text,
  },
  sheetBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#eef4ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.12)",
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: "800",
    color: palette.textSecondary,
    marginBottom: 6,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 2,
  },
  inputIconBubble: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#eef4ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  inputIconBubbleActive: {
    backgroundColor: palette.primary,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: palette.text,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
  eyeBtn: {
    padding: 8,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.dangerSoft,
    borderRadius: 14,
    padding: layout.space.sm,
    marginBottom: layout.space.md,
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.14)",
  },
  errorText: {
    flex: 1,
    color: palette.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  submitWrap: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: layout.space.xs,
  },
  submitGradient: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: layout.space.lg,
    backgroundColor: "#1A367C",
  },
  submitGradientDisabled: {
    backgroundColor: "#94a3b8",
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  btnPressed: {
    opacity: 0.92,
  },
  btnDisabled: {
    opacity: 0.72,
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: layout.space.lg,
    gap: 10,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trustDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.borderSubtle,
  },
  trustText: {
    ...typography.micro,
    color: palette.textHint,
    fontWeight: "700",
  },
});
