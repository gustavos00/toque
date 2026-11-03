// The app's few building blocks. One dark theme, no cards: sections are a small
// caps label over rows split by hairlines, and hierarchy comes from type size and
// weight. The palette is the one gustavodev.pt uses.

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const colors = {
  bg: "#121212",
  raised: "#1b1b1a",
  text: "#ebe9e4",
  soft: "#a8a6a0",
  faint: "#76746f",
  rule: "#282826",
  accent: "#d9b77e",
  danger: "#e0705f",
};

export const fonts = {
  serif: Platform.select({ ios: "Georgia", default: "Georgia, 'Times New Roman', serif" }),
};

export function Screen({
  title,
  eyebrow,
  summary,
  children,
}: {
  title?: string;
  eyebrow?: string;
  summary?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[
        styles.screen,
        title ? { paddingTop: Math.max(insets.top, 20) + 28 } : null,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      {title ? <View style={{ height: 32 }} /> : null}
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
          <Text style={styles.label}>{title}</Text>
          {action}
        </View>
      ) : null}
      <View style={styles.rows}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  value,
  trailing,
  onPress,
  tone,
}: {
  title: string;
  subtitle?: ReactNode;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  tone?: "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.raised }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, tone === "danger" && { color: colors.danger }]}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
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
      placeholderTextColor={colors.faint}
      autoCorrect={false}
      keyboardAppearance="dark"
      selectionColor={colors.accent}
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
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.rule, true: colors.accent }}
      thumbColor={colors.text}
      ios_backgroundColor={colors.rule}
    />
  );
}

/** A full-width button. `primary` is the one main action on a screen. */
export function Button({
  title,
  onPress,
  disabled,
  tone = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        tone === "primary" ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || pressed) && { opacity: 0.5 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          tone === "primary" && { color: colors.bg },
          tone === "danger" && { color: colors.danger },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** A small text action inside a row or a section header. */
export function TextAction({
  title,
  onPress,
  tone,
}: {
  title: string;
  onPress: () => void;
  tone?: "muted";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.textAction, pressed && { opacity: 0.5 }]}
    >
      <Text style={[styles.textActionText, tone === "muted" && { color: colors.soft }]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Text tabs with an underline under the chosen one. */
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
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && { color: colors.text }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One row of a single-choice list; the chosen one reads "Selected". */
export function Choice({
  text,
  active,
  onPress,
}: {
  text: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.raised }]}
    >
      <Text style={[styles.rowTitle, { flex: 1 }, !active && { color: colors.soft }]}>
        {text}
      </Text>
      {active ? <Text style={styles.value}>Selected</Text> : null}
    </Pressable>
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
        accessibilityLabel="Less"
        onPress={() => onChange(Math.max(min, value - step))}
        style={styles.stepBtn}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        accessibilityLabel="More"
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
  if (loading && !hasData)
    return <ActivityIndicator color={colors.soft} style={{ margin: 24 }} />;
  if (error && !hasData)
    return (
      <View style={{ gap: 12, marginBottom: 24 }}>
        <Text style={{ color: colors.danger, fontSize: 15 }}>{error}</Text>
        <Button title="Try again" onPress={onRetry} tone="secondary" />
      </View>
    );
  return null;
}

export function Empty({ title, description }: { title: string; description?: string }) {
  return (
    <View style={[styles.row, { flexDirection: "column", alignItems: "flex-start", gap: 2 }]}>
      <Text style={[styles.rowTitle, { color: colors.soft }]}>{title}</Text>
      {description ? <Text style={styles.rowSubtitle}>{description}</Text> : null}
    </View>
  );
}

export function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return <Text style={styles.message}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
  eyebrow: { color: colors.soft, fontSize: 15, marginBottom: 6 },
  title: {
    fontFamily: fonts.serif,
    fontSize: 36,
    lineHeight: 42,
    color: colors.text,
    letterSpacing: -0.5,
  },
  summary: { color: colors.soft, fontSize: 15, marginTop: 8 },
  section: { marginBottom: 32 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingBottom: 8,
  },
  label: {
    fontSize: 12,
    color: colors.faint,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "500",
  },
  rows: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
  footer: { fontSize: 13, lineHeight: 18, color: colors.faint, paddingTop: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  rowTitle: { fontSize: 17, color: colors.text },
  rowSubtitle: { fontSize: 14, color: colors.faint },
  value: {
    fontSize: 15,
    color: colors.soft,
    fontVariant: ["tabular-nums"],
  },
  input: {
    fontSize: 17,
    minWidth: 96,
    textAlign: "right",
    color: colors.text,
    paddingVertical: 6,
    fontVariant: ["tabular-nums"],
  },
  button: {
    borderRadius: 6,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  buttonPrimary: { backgroundColor: colors.text },
  buttonSecondary: { borderWidth: 1, borderColor: colors.rule },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  textAction: { paddingVertical: 6, paddingHorizontal: 4 },
  textActionText: { color: colors.accent, fontSize: 15, fontWeight: "500" },
  segmented: {
    flexDirection: "row",
    gap: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  segment: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  segmentActive: { borderBottomColor: colors.text },
  segmentText: { fontSize: 15, color: colors.faint },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 18, color: colors.text },
  stepValue: {
    minWidth: 44,
    textAlign: "center",
    fontSize: 17,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  message: { color: colors.danger, fontSize: 15, marginBottom: 12 },
});
