import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

export const colors = {
  bg: "#f2f2f7",
  card: "#ffffff",
  text: "#111111",
  muted: "#6b6b70",
  primary: "#0a7aff",
  danger: "#d92d20",
  warning: "#c77700",
  success: "#2e9d4f",
  separator: "#d8d8dd",
};

export function Screen({
  title,
  eyebrow,
  children,
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </ScrollView>
  );
}

export function Section({
  title,
  footer,
  action,
  children,
}: {
  title?: string;
  footer?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      {title || action ? (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title?.toUpperCase()}</Text>
          {action}
        </View>
      ) : null}
      <View style={styles.card}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  trailing,
  onPress,
  tone,
}: {
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  tone?: "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.rowTitle, tone === "danger" && { color: colors.danger }]}
        >
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowTitle, { flex: 1 }]}>{label}</Text>
      {children}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      autoCorrect={false}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return <Switch value={value} onValueChange={onChange} />;
}

export function Button({
  title,
  onPress,
  disabled,
  tone,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "danger" | "plain";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        tone === "danger" && { backgroundColor: colors.danger },
        tone === "plain" && { backgroundColor: "transparent" },
        (disabled || pressed) && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.buttonText, tone === "plain" && { color: colors.primary }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentActive]}
        >
          <Text style={{ color: o.value === value ? colors.text : colors.muted }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityLabel="menos"
        onPress={() => onChange(Math.max(min, value - step))}
        style={styles.stepBtn}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        accessibilityLabel="mais"
        onPress={() => onChange(Math.min(max, value + step))}
        style={styles.stepBtn}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

export function LoadState({
  loading,
  error,
  hasData,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  hasData: boolean;
  onRetry: () => void;
}) {
  if (loading && !hasData) return <ActivityIndicator style={{ margin: 24 }} />;
  if (error && !hasData)
    return (
      <View style={{ gap: 8, alignItems: "center", margin: 24 }}>
        <Text style={{ color: colors.danger }}>{error}</Text>
        <Button title="Tentar de novo" onPress={onRetry} tone="plain" />
      </View>
    );
  return null;
}

export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <View style={{ padding: 20, alignItems: "center", gap: 4 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      {description ? <Text style={styles.rowSubtitle}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, paddingTop: 64, paddingBottom: 40 },
  eyebrow: { color: colors.muted, textTransform: "capitalize" },
  title: { fontSize: 32, fontWeight: "700", marginBottom: 16, color: colors.text },
  section: { marginBottom: 24 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 13, color: colors.muted, letterSpacing: 0.5 },
  card: { backgroundColor: colors.card, borderRadius: 14, overflow: "hidden" },
  footer: { fontSize: 13, color: colors.muted, padding: 8, paddingHorizontal: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowTitle: { fontSize: 16, color: colors.text },
  rowSubtitle: { fontSize: 14, color: colors.muted },
  input: {
    fontSize: 16,
    minWidth: 80,
    textAlign: "right",
    color: colors.text,
    paddingVertical: 6,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  segmented: {
    flexDirection: "row",
    backgroundColor: "#e5e5ea",
    borderRadius: 9,
    padding: 2,
    margin: 8,
  },
  segment: { flex: 1, padding: 8, alignItems: "center", borderRadius: 7 },
  segmentActive: { backgroundColor: "#fff" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e5e5ea",
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 20 },
  stepValue: { minWidth: 36, textAlign: "center", fontSize: 16 },
});
