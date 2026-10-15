import { ActivityIndicator, Pressable, ScrollView, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors, font } from '../lib/theme';
import { initials } from '../lib/format';

export const tap = () => Haptics.selectionAsync().catch(() => {});

export function Screen({ children, refreshing, onRefresh, padded = true, style, inset = 'automatic' }) {
  const c = useColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[padded && { padding: 16, paddingBottom: 48, gap: 14 }, style]}
      keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior={inset}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.brand} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function T({ children, style, kind = 'body', color, ...rest }) {
  const c = useColors();
  const k = { title: [font.black, { fontSize: 30 }], h2: [font.heavy, { fontSize: 19 }], h3: [font.bold, { fontSize: 16 }], body: [{ fontSize: 16 }], small: [{ fontSize: 13, color: c.muted }], label: [font.bold, { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: c.muted }] }[kind];
  return <Text style={[{ color: c.ink }, ...k, color && { color }, style]} {...rest}>{children}</Text>;
}

export function Card({ children, style, onPress, accessibilityLabel }) {
  const c = useColors();
  const base = [{ backgroundColor: c.panel, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return <Pressable onPress={() => { tap(); onPress(); }} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [base, pressed && { opacity: 0.7 }]}>{children}</Pressable>;
}

export function Button({ title, onPress, kind = 'primary', loading, disabled, small, style, icon }) {
  const c = useColors();
  const bg = { primary: c.brand, ghost: c.panel, danger: c.bad, soft: c.brandSoft }[kind];
  const fg = { primary: '#fff', ghost: c.ink, danger: '#fff', soft: c.brandDark }[kind];
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading) }} disabled={disabled || loading}
      onPress={() => { tap(); onPress?.(); }}
      style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 999, paddingVertical: small ? 9 : 15, paddingHorizontal: small ? 14 : 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, minHeight: small ? 38 : 52, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        kind === 'ghost' && { borderWidth: 1.5, borderColor: c.line2 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>{icon}<Text style={[font.heavy, { color: fg, fontSize: small ? 14 : 16 }]}>{title}</Text></>}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...input }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label && <T kind="h3" style={{ fontSize: 14 }}>{label}</T>}
      <TextInput placeholderTextColor={c.muted} style={[{ backgroundColor: c.panel, borderWidth: 1.5, borderColor: c.line2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: c.ink }, style]} {...input} />
      {hint && <T kind="small">{hint}</T>}
    </View>
  );
}

export function ErrorText({ children }) {
  const c = useColors();
  if (!children) return null;
  return <View style={{ backgroundColor: c.badBg, borderRadius: 12, padding: 12 }} accessibilityRole="alert"><Text style={{ color: c.bad, fontSize: 15 }}>{children}</Text></View>;
}

const HUES = [12, 32, 160, 200, 230, 265, 300, 340, 90, 50];
export function Avatar({ name = '?', size = 34 }) {
  const h = HUES[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % HUES.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${h}, 70%, 88%)`, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden>
      <Text style={[font.heavy, { color: `hsl(${h}, 60%, 28%)`, fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

const CHIP = { in: ['You’re in', 'in'], waitlist: ['Waitlist', 'wait'], maybe: ['Maybe', 'maybe'], out: ['Out', 'out'] };
export function MyChip({ me }) {
  const c = useColors();
  const [label, k] = me ? CHIP[me] : ['Are you in?', 'ask'];
  const fg = { in: c.in, wait: c.wait, maybe: c.maybe, out: c.out, ask: c.brandDark }[k], bg = { in: c.inBg, wait: c.waitBg, maybe: c.maybeBg, out: c.outBg, ask: c.brandSoft }[k];
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' }}><Text style={[font.bold, { color: fg, fontSize: 12 }]}>{label}</Text></View>;
}

export function Meter({ value, max }) {
  const c = useColors();
  return <View style={{ height: 6, borderRadius: 3, backgroundColor: c.panel2, overflow: 'hidden' }}><View style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, height: '100%', backgroundColor: c.brand, borderRadius: 3 }} /></View>;
}

export function Segmented({ options, value, onChange, disabled }) {
  const c = useColors();
  const tint = { in: c.in, maybe: c.maybe, out: c.out };
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.panel2, borderRadius: 16, padding: 4, gap: 4 }} accessibilityRole="radiogroup">
      {options.map(([k, label]) => {
        const on = value === k;
        return (
          <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={() => { tap(); onChange(k); }}
            style={{ flex: 1, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (tint[k] || c.panel) : 'transparent' }}>
            <Text style={[font.heavy, { fontSize: 16, color: on ? (tint[k] ? '#fff' : c.ink) : c.ink2 }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({ value, onChange, min = 0, max = 5, label }) {
  const c = useColors();
  const btn = (d, sign) => (
    <Pressable accessibilityRole="button" accessibilityLabel={d > 0 ? `More ${label}` : `Fewer ${label}`} disabled={d > 0 ? value >= max : value <= min}
      onPress={() => { tap(); onChange(value + d); }} style={({ pressed }) => ({ width: 44, height: 40, alignItems: 'center', justifyContent: 'center', opacity: (d > 0 ? value >= max : value <= min) ? 0.3 : pressed ? 0.6 : 1 })}>
      <Text style={[font.heavy, { fontSize: 20, color: c.ink }]}>{sign}</Text>
    </Pressable>
  );
  return <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: c.line2, borderRadius: 999 }}>{btn(-1, '−')}<Text style={[font.heavy, { minWidth: 22, textAlign: 'center', color: c.ink, fontSize: 16 }]}>{value}</Text>{btn(1, '+')}</View>;
}

export function Empty({ title, children, action }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: c.line2, borderRadius: 18, padding: 24, alignItems: 'center', gap: 10 }}>
      <T kind="h2" style={{ textAlign: 'center' }}>{title}</T>
      {children && <T style={{ textAlign: 'center', color: c.ink2 }}>{children}</T>}
      {action}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: 40 }}><ActivityIndicator color={c.brand} size="large" /></View>;
}

export function Row({ children, style }) { return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>; }
