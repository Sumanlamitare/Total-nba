// Talks to the Turnout API with the bearer token kept in the iOS keychain.
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || '').replace(/\/$/, '');
const KEY = 'turnout.session';

// SecureStore is native-only; the web build (used for previews/tests) falls back to localStorage
export const tokenStore = {
  get: () => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(KEY) ?? null) : SecureStore.getItemAsync(KEY)),
  set: v => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.setItem(KEY, v)) : SecureStore.setItemAsync(KEY, v)),
  clear: () => (Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.removeItem(KEY)) : SecureStore.deleteItemAsync(KEY)),
};

let token = null, onUnauthorized = () => {};
export const setToken = t => { token = t; };
export const onSignedOut = fn => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(`${API_URL}/api/${path}`, {
      method,
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Can’t reach Turnout. Check your connection and try again.'), { offline: true });
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && token) onUnauthorized();
  if (!r.ok) throw Object.assign(new Error(data.error || `Something went wrong (${r.status})`), { status: r.status });
  return data;
}
