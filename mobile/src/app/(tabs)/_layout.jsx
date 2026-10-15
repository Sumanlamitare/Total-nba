import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '../../lib/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: c.brand, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.panel, borderTopColor: c.line },
      headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTitleStyle: { fontWeight: '800', color: c.ink } }}>
      <Tabs.Screen name="home" options={{ title: 'Games', headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="basketball" color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
    </Tabs>
  );
}
