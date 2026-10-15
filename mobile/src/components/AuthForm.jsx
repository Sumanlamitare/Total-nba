import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Linking, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Field, Button, ErrorText, T } from './ui';
import { useSession } from '../lib/session';
import { useColors } from '../lib/theme';
import { API_URL } from '../lib/api';

export default function AuthForm({ mode }) {
  const signup = mode === 'signup', { signIn } = useSession(), c = useColors();
  const { next } = useLocalSearchParams();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function submit() {
    setErr(''); setBusy(true);
    try {
      await signIn(mode, signup ? f : { email: f.email, password: f.password });
      router.replace(typeof next === 'string' && next.startsWith('/') ? next : '/home');
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <T kind="title">{signup ? 'Get in the game' : 'Welcome back'}</T>
        <T style={{ color: c.ink2 }}>{signup ? 'Free, and takes about 20 seconds.' : 'Log in to see your games.'}</T>
        {signup && <Field label="Your name" hint="What your group will see" value={f.name} onChangeText={name => setF({ ...f, name })} placeholder="Marcus Bell" autoComplete="name" textContentType="name" maxLength={40} returnKeyType="next" />}
        <Field label="Email" value={f.email} onChangeText={email => setF({ ...f, email })} placeholder="you@email.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType={signup ? 'emailAddress' : 'username'} returnKeyType="next" />
        <Field label="Password" hint={signup ? 'At least 8 characters' : null} value={f.password} onChangeText={password => setF({ ...f, password })} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} textContentType={signup ? 'newPassword' : 'password'} returnKeyType="go" onSubmitEditing={submit} />
        <ErrorText>{err}</ErrorText>
        <Button title={signup ? 'Create account' : 'Log in'} onPress={submit} loading={busy} />
        {signup && <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>By creating an account you agree to the <Text style={{ color: c.ink2, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${API_URL}/terms`)}>Terms</Text> and <Text style={{ color: c.ink2, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${API_URL}/privacy`)}>Privacy Policy</Text>, including no tolerance for abusive content.</Text>}
        <Button kind="ghost" small title={signup ? 'I already have an account' : 'Create an account instead'} onPress={() => router.replace({ pathname: signup ? '/login' : '/signup', params: next ? { next } : {} })} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
