// Invite preview. Works signed in (join) or signed out (sign up / log in, then come back here).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, T, Button, ErrorText, Loading, Card } from '../../components/ui';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useColors } from '../../lib/theme';
import { sportIcon } from '../../lib/format';

export default function Join() {
  const { code } = useLocalSearchParams(), { user } = useSession(), c = useColors();
  const [g, setG] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api(`groups?invite=${code}`).then(r => setG(r.group), e => setErr(e.message)); }, [code, user]);
  async function join() {
    setBusy(true);
    try { const r = await api(`groups?invite=${code}&action=join`, { method: 'POST', body: {} }); router.replace(`/group/${r.id}`); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  if (!g && !err) return <Loading />;
  const next = `/join/${code}`;
  return (
    <Screen>
      {err ? <ErrorText>{err}</ErrorText> : <>
        <T kind="small" style={{ fontSize: 15 }}>You’re invited to join</T>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 40 }}>{sportIcon(g.sport)}</T></View>
          <T kind="title" style={{ fontSize: 26, textAlign: 'center' }}>{g.name}</T>
          <T kind="small" style={{ fontSize: 15 }}>{[g.location, `${g.members} member${g.members === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</T>
          {!!g.about && <T style={{ color: c.ink2, textAlign: 'center' }}>{g.about}</T>}
        </Card>
        {g.joined ? <Button title="You’re a member — open group" onPress={() => router.replace(`/group/${g.id}`)} />
          : user ? <Button title="Join group" onPress={join} loading={busy} />
          : <>
            <Button title="Sign up to join" onPress={() => router.push({ pathname: '/signup', params: { next } })} />
            <Button kind="ghost" title="I already have an account" onPress={() => router.push({ pathname: '/login', params: { next } })} />
          </>}
      </>}
    </Screen>
  );
}
