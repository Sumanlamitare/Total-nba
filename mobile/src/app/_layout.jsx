import { useEffect } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import '../lib/web';
import { Stack, router, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '../lib/session';
import { listenForTaps } from '../lib/push';
import { useColors } from '../lib/theme';
import { Button, T } from '../components/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Offline() {
  const { refresh, signOutLocal } = useSession(), c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <T kind="title">You're offline</T>
      <T style={{ textAlign: 'center', color: c.ink2 }}>Turnout needs a connection to load your games.</T>
      <Button title="Try again" onPress={() => refresh().catch(() => {})} />
      <Button title="Log out" kind="ghost" small onPress={signOutLocal} />
    </View>
  );
}

function Nav() {
  const { user } = useSession(), c = useColors(), scheme = useColorScheme();
  useEffect(() => { if (user !== undefined) SplashScreen.hideAsync().catch(() => {}); }, [user]);
  useEffect(() => (user && !user.offline ? listenForTaps(url => router.push(url)) : undefined), [user]);
  if (user === undefined) return null; // splash stays up while the session is restored
  if (user?.offline) return <Offline />;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: c.brand, background: c.bg, card: c.bg, text: c.ink, border: c.line } }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerTintColor: c.brand, headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTitleStyle: { fontWeight: '800', color: c.ink }, contentStyle: { backgroundColor: c.bg }, headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="group/[id]" options={{ title: '' }} />
          <Stack.Screen name="game/[id]" options={{ title: '' }} />
          <Stack.Screen name="new-group" options={{ presentation: 'modal', title: 'Start a group' }} />
          <Stack.Screen name="game-form" options={{ presentation: 'modal', title: 'Post a game' }} />
          <Stack.Screen name="join-link" options={{ presentation: 'modal', title: 'Join a group' }} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: 'Log in' }} />
          <Stack.Screen name="signup" options={{ title: 'Create account' }} />
        </Stack.Protected>
        <Stack.Screen name="join/[code]" options={{ title: 'Invite' }} />
      </Stack>
    </ThemeProvider>
  );
}

// On a computer the web preview is shown phone-sized in the middle of the screen
function Frame({ children }) {
  const c = useColors();
  if (Platform.OS !== 'web') return children;
  return <View style={{ flex: 1, backgroundColor: c.panel2 }}><View style={{ flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: c.bg, overflow: 'hidden' }}>{children}</View></View>;
}

export default function Root() {
  return <SessionProvider><Frame><Nav /></Frame></SessionProvider>;
}
