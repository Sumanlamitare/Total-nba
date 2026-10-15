// Ask for notification permission, register this phone with Turnout, and open the right screen on tap.
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let pushToken = null;
export const currentPushToken = () => pushToken;

export async function registerForPush({ ask = true } = {}) {
  if (Platform.OS === 'web' || !Device.isDevice) return null; // simulators and web can't receive pushes
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Games', importance: Notifications.AndroidImportance.HIGH });
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    pushToken = data;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await api('auth', { method: 'POST', body: { action: 'device', token: data, tz } });
    return data;
  } catch (e) {
    console.warn('push registration failed', e?.message);
    return null;
  }
}

// Calls `open(url)` for taps on notifications, including the one that launched the app.
export function listenForTaps(open) {
  if (Platform.OS === 'web') return () => {};
  Notifications.getLastNotificationResponseAsync().then(r => { const url = r?.notification?.request?.content?.data?.url; if (url) open(url); }).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(r => { const url = r.notification.request.content.data?.url; if (url) open(url); });
  return () => sub.remove();
}
