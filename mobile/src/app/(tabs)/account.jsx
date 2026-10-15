import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { Screen, T, Card, Field, Button, ErrorText, Row, Avatar } from '../../components/ui';
import { api, API_URL } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useColors, font } from '../../lib/theme';

export default function Account() {
  const { user, setUser, signOut, signOutLocal, refresh, replaceToken } = useSession(), c = useColors();
  const [name, setName] = useState(user.name), [pw, setPw] = useState({ current: '', password: '' }), [delPw, setDelPw] = useState('');
  const [busy, setBusy] = useState(''), [err, setErr] = useState({});
  const run = async (key, fn) => { setBusy(key); setErr({}); try { await fn(); } catch (e) { setErr({ [key]: e.message }); } setBusy(''); };

  return (
    <Screen>
      <Row style={{ gap: 14 }}><Avatar name={user.name} size={56} /><View style={{ flex: 1 }}><T kind="title" style={{ fontSize: 24 }} numberOfLines={1}>{user.name}</T><T kind="small" style={{ fontSize: 15 }}>{user.email}</T></View></Row>

      <Card style={{ gap: 12 }}>
        <Field label="Your name" hint="Shown to your groups" value={name} onChangeText={setName} maxLength={40} />
        <ErrorText>{err.name}</ErrorText>
        <Button small title="Save name" disabled={!name.trim() || name === user.name} loading={busy === 'name'}
          onPress={() => run('name', async () => { const r = await api('auth', { method: 'PATCH', body: { name } }); setUser({ ...user, ...r.user }); })} />
      </Card>

      <Card style={{ gap: 12 }}>
        <T kind="h3">Change password</T>
        <Field label="Current password" value={pw.current} onChangeText={current => setPw({ ...pw, current })} secureTextEntry textContentType="password" />
        <Field label="New password" hint="At least 8 characters. Other devices will be signed out." value={pw.password} onChangeText={password => setPw({ ...pw, password })} secureTextEntry textContentType="newPassword" />
        <ErrorText>{err.pw}</ErrorText>
        <Button small title="Change password" disabled={!pw.current || !pw.password} loading={busy === 'pw'}
          onPress={() => run('pw', async () => { const r = await api('auth', { method: 'POST', body: { action: 'password', app: true, ...pw } }); await replaceToken(r.token); setPw({ current: '', password: '' }); Alert.alert('Password changed'); })} />
      </Card>

      <Card style={{ gap: 10 }}>
        <T kind="h3">Notifications</T>
        <T kind="small" style={{ fontSize: 14 }}>New games, waitlist spots and cancellations. Turn them on or off in Settings.</T>
        <Button small kind="ghost" title="Open notification settings" onPress={() => Linking.openSettings()} />
      </Card>

      {user.blockedPeople?.length > 0 && (
        <Card style={{ gap: 10 }}>
          <T kind="h3">Blocked</T>
          {user.blockedPeople.map(b => (
            <Row key={b.userId} style={{ justifyContent: 'space-between' }}><T style={font.semi}>{b.name}</T>
              <Button small kind="ghost" title="Unblock" onPress={() => run('block', async () => { await api('auth', { method: 'POST', body: { action: 'unblock', userId: b.userId } }); await refresh(); })} /></Row>
          ))}
        </Card>
      )}

      <Card style={{ gap: 4 }}>
        {[['Support', '/support'], ['Privacy Policy', '/privacy'], ['Terms of Use', '/terms']].map(([label, path]) => (
          <Button key={path} small kind="ghost" title={label} onPress={() => Linking.openURL(API_URL + path)} style={{ borderWidth: 0, justifyContent: 'flex-start' }} />
        ))}
      </Card>

      <Button kind="ghost" title="Log out" onPress={signOut} />

      <Card style={{ gap: 12, borderColor: c.bad }}>
        <T kind="h3" color={c.bad}>Delete account</T>
        <T kind="small" style={{ fontSize: 14 }}>Removes your account, your answers and your devices right away. Groups you own alone are deleted too. This can’t be undone.</T>
        <Field label="Password" value={delPw} onChangeText={setDelPw} secureTextEntry textContentType="password" />
        <ErrorText>{err.del}</ErrorText>
        <Button kind="danger" small title="Delete my account" disabled={!delPw} loading={busy === 'del'}
          onPress={() => Alert.alert('Delete your account?', 'Everything is removed immediately.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => run('del', async () => { await api('auth', { method: 'DELETE', body: { password: delPw } }); await signOutLocal(); }) }])} />
      </Card>
    </Screen>
  );
}
