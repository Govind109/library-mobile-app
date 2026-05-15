import { useAuth } from "@/context/AuthContext";
import { palette } from "@/constants/Theme";
import { resolveMediaCandidates } from "@/lib/config";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const LOGO = require("../assets/images/icon.png");

export function BrandedTabHeader({ screenTitle }) {
  const { library } = useAuth();
  const libraryName = (library?.name || library?.unique_id || "Library").trim();
  const logoCandidates = useMemo(
    () => resolveMediaCandidates(library?.logo_url),
    [library?.logo_url],
  );
  const [logoIndex, setLogoIndex] = useState(0);

  useEffect(() => {
    setLogoIndex(0);
  }, [library?.logo_url]);

  const currentLogo = logoCandidates[logoIndex];

  return (
    <View style={styles.row}>
      <Image
        source={currentLogo ? { uri: currentLogo } : LOGO}
        style={styles.logo}
        contentFit="cover"
        onError={() =>
          setLogoIndex((prev) =>
            prev + 1 < logoCandidates.length ? prev + 1 : prev,
          )
        }
      />
      <View style={styles.screenLineContainer}>
        <Text style={styles.libraryLine} numberOfLines={1}>
          {libraryName}
        </Text>
        <Text style={styles.screenLine} numberOfLines={1}>
          {screenTitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingVertical: 4,
    minHeight: 44,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
  },
  libraryLine: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 22,
    marginLeft: 10,
    flexShrink: 1,
  },
  screenLine: {
    color: "rgba(226,232,240,0.95)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginLeft: 8,
    flexShrink: 0,
  },
});
