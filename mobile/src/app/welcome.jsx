import { View, Text, Image, Linking } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { font } from '../lib/theme';
import { API_URL } from '../lib/api';

const POINTS = [['👆', 'One tap: in, maybe or out'], ['⏳', 'Waitlist that fills itself'], ['⚖️', 'Fair teams in a second'], ['📋', 'Know who actually shows up']];

export default function Welcome() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ff5a1f' }}>
      <View style={{ flex: 1, padding: 28, justifyContent: 'space-between' }}>
        <View style={{ gap: 22, marginTop: 24 }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 64, height: 64, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' }} accessibilityIgnoresInvertColors />
          <Text style={[font.black, { color: '#fff', fontSize: 44, lineHeight: 46 }]} accessibilityRole="header">Run the game, not the group chat.</Text>
          <View style={{ gap: 12 }}>
            {POINTS.map(([e, t]) => <Text key={t} style={[font.bold, { color: '#fff', fontSize: 18 }]}>{e}  {t}</Text>)}
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Button title="Create a free account" kind="ghost" onPress={() => router.push('/signup')} style={{ backgroundColor: '#fff', borderColor: '#fff' }} />
          <Button title="I already have an account" onPress={() => router.push('/login')} style={{ backgroundColor: 'rgba(0,0,0,0.12)' }} />
          <Text style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontSize: 13 }}>
            By continuing you agree to the <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${API_URL}/terms`)}>Terms</Text> and <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${API_URL}/privacy`)}>Privacy Policy</Text>.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
