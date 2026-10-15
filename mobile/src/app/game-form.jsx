// Post a game (params: groupId), edit one (id), or post next week's from an existing one (from + startsAt).
import { useEffect, useLayoutEffect, useState } from 'react';
import { Platform, Pressable, Switch, View, KeyboardAvoidingView } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Screen, T, Field, Button, ErrorText, Row, Stepper, Loading, tap } from '../components/ui';
import { api } from '../lib/api';
import { useColors, font } from '../lib/theme';

const LENGTHS = [60, 90, 120, 180];
const tomorrow7 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(19, 0, 0, 0); return d; };

function When({ value, onChange, c }) {
  if (Platform.OS === 'web') { // the web preview has no native picker
    const iso = new Date(+value - value.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
    return <Field label="Date & time" value={iso.replace('T', ' ')} onChangeText={t => { const d = new Date(t.replace(' ', 'T')); if (!Number.isNaN(+d)) onChange(d); }} />;
  }
  return (
    <View style={{ gap: 6 }}>
      <T kind="h3" style={{ fontSize: 14 }}>Date & time</T>
      <Row style={{ gap: 8 }}>
        <DateTimePicker value={value} mode="date" display="compact" minimumDate={new Date()} accentColor={c.brand} onValueChange={(_, d) => d && onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), value.getHours(), value.getMinutes()))} />
        <DateTimePicker value={value} mode="time" display="compact" minuteInterval={5} accentColor={c.brand} onValueChange={(_, d) => d && onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), d.getHours(), d.getMinutes()))} />
      </Row>
    </View>
  );
}

export default function GameForm() {
  const { groupId, id, from, startsAt } = useLocalSearchParams(), c = useColors(), nav = useNavigation();
  const editing = !!id;
  const [f, setF] = useState(null), [gid, setGid] = useState(groupId), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useLayoutEffect(() => { nav.setOptions({ title: editing ? 'Edit game' : 'Post a game' }); }, [nav, editing]);

  useEffect(() => {
    (async () => {
      try {
        if (id || from) {
          const { game } = await api(`games?id=${id || from}`);
          setGid(game.group.id);
          setF({ when: startsAt ? new Date(startsAt) : new Date(game.startsAt), duration: game.duration, capacity: game.capacity, minPlayers: game.minPlayers, location: game.location, cost: game.cost ? String(game.cost) : '', notes: game.notes, imIn: !editing });
        } else {
          const d = await api(`groups?id=${groupId}`);
          const size = d.sports?.[d.group.sport]?.size || 10;
          setF({ when: tomorrow7(), duration: 90, capacity: size, minPlayers: Math.min(size, Math.max(2, Math.round(size * 0.8))), location: d.group.location, cost: '', notes: '', imIn: true });
        }
      } catch (e) { setErr(e.message); }
    })();
  }, [id, from, groupId, startsAt, editing]);

  async function save() {
    setBusy(true); setErr('');
    const body = { startsAt: f.when.toISOString(), duration: f.duration, capacity: f.capacity, minPlayers: Math.min(f.minPlayers, f.capacity), location: f.location, cost: f.cost === '' ? 0 : Number(f.cost.replace(',', '.')), notes: f.notes };
    try {
      if (editing) { await api(`games?id=${id}`, { method: 'PATCH', body }); router.back(); }
      else { const r = await api('games', { method: 'POST', body: { ...body, groupId: gid, imIn: f.imIn } }); router.replace(`/game/${r.id}`); }
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (!f) return err ? <Screen><ErrorText>{err}</ErrorText></Screen> : <Loading />;
  const set = patch => setF(x => ({ ...x, ...patch }));
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <When value={f.when} onChange={when => set({ when })} c={c} />
        <Row style={{ justifyContent: 'space-between' }}><View><T kind="h3">Spots</T><T kind="small">Including guests</T></View><Stepper label="spots" value={f.capacity} min={2} max={60} onChange={capacity => set({ capacity, minPlayers: Math.min(f.minPlayers, capacity) })} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><View><T kind="h3">Need at least</T><T kind="small">To call it on</T></View><Stepper label="players needed" value={f.minPlayers} min={0} max={f.capacity} onChange={minPlayers => set({ minPlayers })} /></Row>
        <View style={{ gap: 6 }}>
          <T kind="h3" style={{ fontSize: 14 }}>Length</T>
          <Row>{LENGTHS.map(m => (
            <Pressable key={m} onPress={() => { tap(); set({ duration: m }); }} accessibilityRole="radio" accessibilityState={{ selected: f.duration === m }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: f.duration === m ? c.brand : c.line2, backgroundColor: f.duration === m ? c.brandSoft : c.panel }}>
              <T style={[font.bold, { fontSize: 14 }]}>{m < 60 ? `${m}m` : `${m / 60}h`}</T></Pressable>))}</Row>
        </View>
        <Field label="Location" value={f.location} onChangeText={location => set({ location })} placeholder="Court, field or address" maxLength={120} />
        <Field label="Total cost (optional)" hint="Split across everyone who’s in" value={f.cost} onChangeText={cost => set({ cost: cost.replace(/[^\d.,]/g, '') })} placeholder="0" keyboardType="decimal-pad" />
        <Field label="Notes (optional)" value={f.notes} onChangeText={notes => set({ notes })} placeholder="Bring a light and a dark shirt" multiline style={{ minHeight: 80, textAlignVertical: 'top' }} maxLength={1000} />
        {!editing && <Row style={{ justifyContent: 'space-between' }}><T kind="h3">I’m playing</T><Switch value={f.imIn} onValueChange={imIn => set({ imIn })} trackColor={{ true: c.brand }} /></Row>}
        <ErrorText>{err}</ErrorText>
        <Button title={editing ? 'Save changes' : 'Post game'} onPress={save} loading={busy} />
        {!editing && <T kind="small" style={{ textAlign: 'center' }}>Everyone in the group gets a notification.</T>}
      </Screen>
    </KeyboardAvoidingView>
  );
}
