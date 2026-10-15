// Web-only stand-ins so the browser preview behaves like the phone: native alerts and action sheets.
import { Alert, Platform } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = (buttons || []).filter(b => b.style !== 'cancel');
    if (!actions.length) { window.alert(text); return; }
    if (actions.length === 1) { if (window.confirm(`${text}\n\n→ ${actions[0].text}?`)) actions[0].onPress?.(); return; }
    const pick = window.prompt(`${text}\n\n${actions.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}\n\nType a number:`);
    const b = actions[Number(pick) - 1];
    if (b) setTimeout(() => b.onPress?.(), 0);
  };
}
