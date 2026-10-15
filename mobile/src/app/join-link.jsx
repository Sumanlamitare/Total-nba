import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, T, Field, Button, ErrorText } from '../components/ui';
import { inviteCode } from '../lib/format';

export default function JoinLink() {
  const [v, setV] = useState(''), [err, setErr] = useState('');
  function go() {
    const code = inviteCode(v);
    if (!code) return setErr('Paste the whole invite link your organizer sent');
    router.replace(`/join/${code}`);
  }
  return (
    <Screen>
      <T>Paste the invite link from your group chat.</T>
      <Field label="Invite link" value={v} onChangeText={t => { setV(t); setErr(''); }} placeholder="https://…/join/…" autoCapitalize="none" autoCorrect={false} autoFocus onSubmitEditing={go} returnKeyType="go" />
      <ErrorText>{err}</ErrorText>
      <Button title="Continue" onPress={go} disabled={!v.trim()} />
    </Screen>
  );
}
