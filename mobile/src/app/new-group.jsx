import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, T, Field, Button, ErrorText, tap } from '../components/ui';
import { api } from '../lib/api';
import { useColors, font } from '../lib/theme';
import { SPORTS } from '../lib/format';

export default function NewGroup() {
  const c = useColors();
  const [f, setF] = useState({ name: '', sport: 'basketball', location: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true); setErr('');
    try { const r = await api('groups', { method: 'POST', body: f }); router.replace(`/group/${r.id}`); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Screen>
      <Field label="Group name" value={f.name} onChangeText={name => setF({ ...f, name })} placeholder="Tuesday Night Hoops" maxLength={60} autoFocus />
      <T kind="h3" style={{ fontSize: 14 }}>Sport</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
        {Object.entries(SPORTS).map(([k, [name, icon]]) => {
          const on = f.sport === k;
          return (
            <Pressable key={k} onPress={() => { tap(); setF({ ...f, sport: k }); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={name}
              style={{ width: '31%', flexGrow: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: on ? c.brand : c.line2, backgroundColor: on ? c.brandSoft : c.panel }}>
              <T style={{ fontSize: 24 }}>{icon}</T><T style={[font.semi, { fontSize: 12 }]}>{name}</T>
            </Pressable>
          );
        })}
      </View>
      <Field label="Usual spot (optional)" hint="Games default to this location" value={f.location} onChangeText={location => setF({ ...f, location })} placeholder="Rucker Park, court 2" maxLength={120} />
      <ErrorText>{err}</ErrorText>
      <Button title="Create group" onPress={create} loading={busy} disabled={!f.name.trim()} />
    </Screen>
  );
}
