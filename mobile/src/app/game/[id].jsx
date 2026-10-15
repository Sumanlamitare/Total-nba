import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, Share, TextInput, View, AppState } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, T, Card, Button, ErrorText, Row, Loading, Avatar, Segmented, Stepper, tap } from '../../components/ui';
import { api, API_URL } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useColors, font } from '../../lib/theme';
import { longDay, clock, ago, money, sportIcon } from '../../lib/format';

const TEAM = ['Lights', 'Darks', 'Reds', 'Blues'];

function Banner({ g, c }) {
  let text, fg, bg;
  if (g.status === 'canceled') [text, fg, bg] = ['❌  This game was canceled', c.bad, c.badBg];
  else if (g.status === 'played') [text, fg, bg] = [`🏁  ${g.final?.score ? `Final: ${g.final.score.join(' – ')}` : 'Played'}`, c.ink, c.panel2];
  else if (g.need > 0) [text, fg, bg] = [`Need ${g.need} more to play · ${g.taken}/${g.capacity} in`, c.wait, c.waitBg];
  else if (g.taken >= g.capacity) [text, fg, bg] = [`🔥  Game on — full${g.waitlist ? ` · ${g.waitlist} waiting` : ''}`, c.in, c.inBg];
  else [text, fg, bg] = [`✅  Game on · ${g.capacity - g.taken} spot${g.capacity - g.taken === 1 ? '' : 's'} left`, c.in, c.inBg];
  return <View style={{ backgroundColor: bg, borderRadius: 16, padding: 14 }} accessibilityRole="summary"><T style={[font.heavy, { color: fg }]}>{text}</T></View>;
}

function People({ title, list, numbered, c }) {
  return (
    <View style={{ gap: 8 }}>
      <T kind="label">{title}</T>
      {list.length === 0 ? <T kind="small">Nobody yet — be the first.</T> : list.map((p, i) => (
        <Row key={p.userId} style={{ gap: 10 }}>
          {numbered && <T style={[font.heavy, { color: c.wait, width: 16 }]}>{i + 1}</T>}
          <Avatar name={p.name} size={30} /><T style={[font.semi, { flex: 1 }]} numberOfLines={1}>{p.name}</T>
          {p.guests > 0 && <View style={{ backgroundColor: c.brandSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}><T style={[font.heavy, { fontSize: 12, color: c.brandDark }]}>+{p.guests}</T></View>}
        </Row>
      ))}
    </View>
  );
}

export default function Game() {
  const { id } = useLocalSearchParams(), c = useColors(), nav = useNavigation(), { user, setUser } = useSession();
  const [g, setG] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(''), [refreshing, setRefreshing] = useState(false);
  const [guests, setGuests] = useState(0), [nTeams, setNTeams] = useState(2), [msg, setMsg] = useState('');
  const [score, setScore] = useState([]), [noShows, setNoShows] = useState([]);
  const load = useCallback(() => api(`games?id=${id}`).then(r => { setG(r.game); setErr(''); }, e => setErr(e.message)), [id]);
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(() => AppState.currentState === 'active' && load(), 20000);
    return () => clearInterval(t);
  }, [load]));
  useEffect(() => { if (g) { setGuests(g.myGuests); setScore(s => (s.length === (g.teams?.length || 0) ? s : (g.teams || []).map(() => ''))); } }, [g?.myGuests, g?.teams?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(async (action, body = {}, label = action) => {
    setBusy(label);
    try { const r = await api(`games?id=${id}&action=${action}`, { method: 'POST', body }); if (r.game) setG(r.game); return r; }
    catch (e) { Alert.alert('Couldn’t do that', e.message); }
    finally { setBusy(''); }
  }, [id]);

  const organizerMenu = useCallback(() => {
    if (!g?.admin) return;
    const next = new Date(+new Date(g.startsAt) + 7 * 864e5).toISOString();
    Alert.alert('Organizer', undefined, [
      ...(g.status === 'scheduled' ? [{ text: 'Edit game', onPress: () => router.push({ pathname: '/game-form', params: { id: g.id } }) }] : []),
      { text: 'Post next week’s game', onPress: () => router.push({ pathname: '/game-form', params: { from: g.id, startsAt: next } }) },
      g.status === 'scheduled' ? { text: 'Cancel game', style: 'destructive', onPress: () => Alert.alert('Cancel this game?', 'Players will be notified.', [{ text: 'Keep it', style: 'cancel' }, { text: 'Cancel game', style: 'destructive', onPress: () => act('cancel') }]) }
        : { text: 'Reopen game', onPress: () => act('reopen') },
      { text: 'Delete game', style: 'destructive', onPress: () => Alert.alert('Delete this game?', 'Its chat and result are deleted too.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => api(`games?id=${g.id}`, { method: 'DELETE' }).then(() => router.back(), e => Alert.alert('Couldn’t delete', e.message)) }]) },
      { text: 'Close', style: 'cancel' },
    ]);
  }, [g, act]);
  const shareGame = useCallback(() => g && Share.share({ message: `${g.group.name} — ${longDay(g.startsAt)}, ${clock(g.startsAt)}${g.location ? ` at ${g.location}` : ''}. Are you in? ${API_URL}/game/${g.id}` }), [g]);
  useLayoutEffect(() => {
    nav.setOptions({
      title: g ? `${sportIcon(g.group.sport)} ${g.group.name}` : '',
      headerRight: () => (
        <Row style={{ gap: 16 }}>
          <Pressable onPress={shareGame} hitSlop={10} accessibilityLabel="Share game"><Ionicons name="share-outline" size={24} color={c.brand} /></Pressable>
          {g?.admin && <Pressable onPress={organizerMenu} hitSlop={10} accessibilityLabel="Organizer options"><Ionicons name="ellipsis-horizontal-circle" size={26} color={c.brand} /></Pressable>}
        </Row>
      ),
    });
  }, [nav, g, c, organizerMenu, shareGame]);

  function messageMenu(m) {
    const buttons = [];
    if (m.mine || g.admin) buttons.push({ text: 'Delete message', style: 'destructive', onPress: () => act('uncomment', { commentId: m.id }) });
    if (!m.mine) {
      buttons.push({ text: 'Report message', onPress: () => act('report', { commentId: m.id, reason: 'Reported from the app' }).then(r => r && Alert.alert('Thanks for reporting', 'We review reports within 24 hours.')) });
      buttons.push({ text: `Block ${m.name}`, style: 'destructive', onPress: () => Alert.alert(`Block ${m.name}?`, 'You won’t see their messages anymore. You can unblock them from Account.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: async () => { try { const r = await api('auth', { method: 'POST', body: { action: 'block', userId: m.userId } }); setUser(r.user); load(); } catch (e) { Alert.alert('Couldn’t block', e.message); } } }]) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(m.name, m.text.slice(0, 120), buttons);
  }

  if (!g && !err) return <Loading />;
  if (!g) return <Screen><ErrorText>{err}</ErrorText></Screen>;
  const end = new Date(+new Date(g.startsAt) + g.duration * 60e3);
  const want = g.me === 'waitlist' ? 'in' : g.me;
  const place = g.roster.waitlist.findIndex(r => r.userId === user.id) + 1;
  const status = g.me === 'in' ? ['You’re in ✅', c.in] : g.me === 'waitlist' ? [`You’re #${place} on the waitlist`, c.wait] : g.me === 'maybe' ? ['Marked as maybe', c.maybe] : g.me === 'out' ? ['You’re out this time', c.muted] : ['Are you in?', c.brandDark];
  const answer = (w, n = guests) => act('rsvp', { want: w, guests: w === 'in' ? n : 0 }, 'rsvp');
  const canTeam = g.admin && g.status === 'scheduled';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90} style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
        <View style={{ gap: 4 }}>
          <T kind="title" style={{ fontSize: 28 }} accessibilityRole="header">{longDay(g.startsAt)}</T>
          <T style={[font.bold, { fontSize: 18, color: c.ink2 }]}>{clock(g.startsAt)} – {clock(end)}</T>
          {!!g.location && <Pressable onPress={() => Linking.openURL(`${Platform.OS === 'ios' ? 'http://maps.apple.com/?q=' : 'https://www.google.com/maps/search/?api=1&query='}${encodeURIComponent(g.location)}`)} accessibilityRole="link" accessibilityLabel={`Open ${g.location} in Maps`}>
            <T style={[font.bold, { color: c.brandDark, marginTop: 4 }]}>📍 {g.location}</T></Pressable>}
        </View>
        <Banner g={g} c={c} />
        {!!g.notes && <Card style={{ borderLeftWidth: 4, borderLeftColor: c.brand }}><T style={{ color: c.ink2 }}>{g.notes}</T></Card>}

        {g.status === 'scheduled' && (
          <Card style={{ gap: 12 }}>
            <T style={[font.heavy, { fontSize: 20, color: status[1] }]}>{status[0]}</T>
            {g.me === 'waitlist' && <T kind="small">You’ll get a notification the moment a spot opens up.</T>}
            <Segmented options={[['in', 'I’m in'], ['maybe', 'Maybe'], ['out', 'Out']]} value={want} disabled={busy === 'rsvp'} onChange={w => w !== want && answer(w)} />
            {want === 'in' && <Row style={{ justifyContent: 'space-between' }}><T style={font.semi}>Bringing guests?</T><Stepper label="guests" value={guests} max={5} onChange={n => { setGuests(n); answer('in', n); }} /></Row>}
            {g.costEach != null && <T kind="small">{money(g.cost)} total · about <T kind="small" style={[font.heavy, { color: c.ink }]}>{money(g.costEach)}</T> each right now</T>}
          </Card>
        )}

        <Card style={{ gap: 16 }}>
          <People title={`In · ${g.taken}/${g.capacity}`} list={g.roster.in} c={c} />
          {g.roster.waitlist.length > 0 && <People title="Waitlist" list={g.roster.waitlist} numbered c={c} />}
          {g.roster.maybe.length > 0 && <People title="Maybe" list={g.roster.maybe} c={c} />}
          {g.roster.out.length > 0 && <People title="Out" list={g.roster.out} c={c} />}
        </Card>

        {(g.teams || canTeam) && (
          <Card style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}><T kind="h2">Teams</T>
              {canTeam && <Row>{[2, 3, 4].map(n => <Pressable key={n} onPress={() => { tap(); setNTeams(n); }} accessibilityRole="radio" accessibilityState={{ selected: nTeams === n }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: nTeams === n ? c.brandSoft : 'transparent' }}><T style={[font.bold, { color: nTeams === n ? c.brandDark : c.muted }]}>{n}</T></Pressable>)}</Row>}
            </Row>
            {g.teams ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {g.teams.map((t, k) => (
                  <View key={k} style={{ flexGrow: 1, flexBasis: '45%', borderRadius: 14, padding: 12, gap: 6, backgroundColor: k === 1 ? '#23252c' : k === 0 ? c.panel2 : k === 2 ? c.badBg : c.maybeBg }}>
                    <Row style={{ justifyContent: 'space-between' }}><T style={[font.heavy, k === 1 && { color: '#fff' }]}>{TEAM[k]}</T>{g.final?.score && <T style={[font.black, { fontSize: 20 }, k === 1 && { color: '#fff' }]}>{g.final.score[k]}</T>}</Row>
                    {t.map(p => <T key={p.id} style={[font.semi, { fontSize: 14 }, k === 1 && { color: '#eee' }]} numberOfLines={1}>{p.name}</T>)}
                  </View>
                ))}
              </View>
            ) : <T kind="small">Balanced by the skill ratings organizers set. Includes everyone who’s in, plus guests.</T>}
            {canTeam && <Row><Button small title={g.teams ? 'Reshuffle' : 'Make teams'} loading={busy === 'teams'} onPress={() => act('teams', { n: nTeams })} />{g.teams && <Button small kind="ghost" title="Clear" onPress={() => act('clearteams')} />}</Row>}
          </Card>
        )}

        {g.admin && g.status === 'scheduled' && g.started && (
          <Card style={{ gap: 12 }}>
            <T kind="h2">Record the result</T>
            {g.teams && <Row style={{ flexWrap: 'wrap' }}>{g.teams.map((_, k) => (
              <View key={k} style={{ gap: 4 }}><T kind="small" style={font.bold}>{TEAM[k]}</T>
                <TextInput value={score[k] ?? ''} onChangeText={v => setScore(s => s.map((x, i) => (i === k ? v.replace(/\D/g, '') : x)))} keyboardType="number-pad" maxLength={3} accessibilityLabel={`${TEAM[k]} score`}
                  style={{ width: 80, borderWidth: 1.5, borderColor: c.line2, borderRadius: 12, padding: 10, fontSize: 22, fontWeight: '800', textAlign: 'center', color: c.ink }} /></View>))}</Row>}
            <T style={font.bold}>Who didn’t show up?</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {g.roster.in.map(p => {
                const on = noShows.includes(p.userId);
                return <Pressable key={p.userId} onPress={() => { tap(); setNoShows(s => (on ? s.filter(x => x !== p.userId) : [...s, p.userId])); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  style={{ borderWidth: 1.5, borderColor: on ? c.bad : c.line2, backgroundColor: on ? c.badBg : 'transparent', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}><T style={[font.semi, { fontSize: 14, color: on ? c.bad : c.ink }]}>{p.name}</T></Pressable>;
              })}
            </View>
            <Button title="Save result" loading={busy === 'result'} onPress={() => act('result', { score: g.teams ? score : null, noShows })} />
          </Card>
        )}

        <Card style={{ gap: 12 }}>
          <T kind="h2">Chat</T>
          {g.comments.length === 0 && <T kind="small">No messages yet.</T>}
          {g.comments.map(m => (
            <Pressable key={m.id} onLongPress={() => messageMenu(m)} delayLongPress={300} style={{ flexDirection: 'row', gap: 10 }} accessibilityHint="Long press for options">
              <Avatar name={m.name} size={30} />
              <View style={{ flex: 1 }}>
                <Row style={{ gap: 6 }}><T style={font.bold}>{m.name}</T><T kind="small">{ago(m.at)}</T><View style={{ flex: 1 }} />
                  <Pressable onPress={() => messageMenu(m)} hitSlop={10} accessibilityLabel={`Options for ${m.name}'s message`}><Ionicons name="ellipsis-horizontal" size={18} color={c.muted} /></Pressable></Row>
                <T style={{ color: c.ink2 }}>{m.text}</T>
              </View>
            </Pressable>
          ))}
          <Row>
            <TextInput value={msg} onChangeText={setMsg} placeholder="Running late? Need a ride?" placeholderTextColor={c.muted} maxLength={500} accessibilityLabel="Message"
              style={{ flex: 1, borderWidth: 1.5, borderColor: c.line2, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, fontSize: 16, color: c.ink }} />
            <Button small title="Send" disabled={!msg.trim()} loading={busy === 'comment'} onPress={async () => { const r = await act('comment', { text: msg }); if (r) setMsg(''); }} />
          </Row>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
