import { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, Share, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, T, Card, Button, Empty, ErrorText, Row, Loading, Avatar, Segmented, tap } from '../../components/ui';
import GameCard from '../../components/GameCard';
import { api, API_URL } from '../../lib/api';
import { useColors, font } from '../../lib/theme';
import { SPORTS, sportIcon } from '../../lib/format';

const inviteUrl = code => `${API_URL}/join/${code}`;

function Table({ stats, me, c }) {
  if (!stats.length) return <Empty title="No results yet">Once an organizer records a game's score and attendance, the table fills in.</Empty>;
  const rows = [...stats].sort((a, b) => b.played - a.played || b.wins - a.wins || a.name.localeCompare(b.name));
  const col = { width: 46, textAlign: 'right' };
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Row style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: c.line }}>
        <T kind="label" style={{ flex: 1 }}>Player</T><T kind="label" style={col}>GP</T><T kind="label" style={[col, { width: 64 }]}>W-L-D</T><T kind="label" style={[col, { width: 58 }]}>Rely</T>
      </Row>
      {rows.map(s => {
        const r = s.reliability, rc = r == null ? c.muted : r >= 0.9 ? c.in : r >= 0.7 ? c.wait : c.bad;
        return (
          <Row key={s.userId} style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: c.line, backgroundColor: s.userId === me ? c.brandSoft : 'transparent' }}
            accessible accessibilityLabel={`${s.name}: ${s.played} played, ${s.wins} wins, ${s.losses} losses, reliability ${r == null ? 'none' : Math.round(r * 100) + ' percent'}`}>
            <Row style={{ flex: 1, gap: 8 }}><Avatar name={s.name} size={26} /><T style={font.semi} numberOfLines={1}>{s.name}</T></Row>
            <T style={col}>{s.played}</T><T style={[col, { width: 64 }]}>{s.wins}-{s.losses}-{s.draws}</T>
            <T style={[col, font.heavy, { width: 58, color: rc }]}>{r == null ? '—' : `${Math.round(r * 100)}%`}</T>
          </Row>
        );
      })}
      <T kind="small" style={{ padding: 14 }}>Reliability = games shown up to ÷ (games committed + late drops). Late = dropping out within 24 hours.</T>
    </Card>
  );
}

function Members({ data, reload, c }) {
  const admin = data.me.admin;
  async function act(action, body, done) {
    try { await api(`groups?id=${data.group.id}&action=${action}`, { method: 'POST', body }); if (done) Alert.alert(done); reload(); }
    catch (e) { Alert.alert('Couldn’t do that', e.message); }
  }
  function menu(m) {
    if (!admin || m.role === 'owner' || m.userId === data.me.userId) return;
    const buttons = [
      m.role === 'member' ? { text: 'Make organizer', onPress: () => act('role', { userId: m.userId, role: 'admin' }) } : { text: 'Make player', onPress: () => act('role', { userId: m.userId, role: 'member' }) },
      ...(data.me.role === 'owner' ? [{ text: 'Make owner', onPress: () => Alert.alert(`Hand the group to ${m.name}?`, 'You’ll become an organizer.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Hand over', onPress: () => act('role', { userId: m.userId, role: 'owner' }) }]) }] : []),
      { text: 'Remove from group', style: 'destructive', onPress: () => act('remove', { userId: m.userId }) },
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert(m.name, undefined, buttons);
  }
  const order = { owner: 0, admin: 1, member: 2 };
  return (
    <Card style={{ padding: 0 }}>
      {admin && <T kind="small" style={{ padding: 14, paddingBottom: 4 }}>Skill (1–5) is only visible to organizers and balances teams. Tap a player for more.</T>}
      {[...data.members].sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name)).map(m => (
        <Pressable key={m.userId} onPress={() => menu(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: 1, borderColor: c.line }}>
          <Avatar name={m.name} size={38} />
          <View style={{ flex: 1 }}><T style={font.bold} numberOfLines={1}>{m.name}{m.userId === data.me.userId ? ' (you)' : ''}</T><T kind="small">{m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Organizer' : 'Player'}</T></View>
          {admin && (
            <Row style={{ gap: 6 }} accessibilityRole="adjustable" accessibilityLabel={`Skill ${m.skill} of 5`}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} hitSlop={6} onPress={() => { tap(); act('skill', { userId: m.userId, skill: n }); }} accessibilityLabel={`Set skill ${n}`}
                  style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: n <= m.skill ? c.brand : c.line2, backgroundColor: n <= m.skill ? c.brand : 'transparent' }} />
              ))}
            </Row>
          )}
        </Pressable>
      ))}
    </Card>
  );
}

export default function Group() {
  const { id } = useLocalSearchParams(), c = useColors(), nav = useNavigation();
  const [data, setData] = useState(null), [err, setErr] = useState(''), [tab, setTab] = useState('games'), [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => api(`groups?id=${id}`).then(d => { setData(d); setErr(''); }, e => setErr(e.message)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = useCallback(() => data?.group.invite && Share.share({ message: `Join ${data.group.name} on Turnout — ${inviteUrl(data.group.invite)}` }), [data]);
  const more = useCallback(() => {
    if (!data) return;
    const g = data.group, owner = data.me.role === 'owner';
    const buttons = [
      ...(data.me.admin ? [{ text: 'Share invite link', onPress: share }, { text: 'Replace invite link', onPress: () => Alert.alert('Replace the invite link?', 'The current link will stop working.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', onPress: () => api(`groups?id=${g.id}&action=invite`, { method: 'POST', body: {} }).then(load) }]) }] : []),
      owner ? { text: 'Delete group', style: 'destructive', onPress: () => Alert.alert(`Delete ${g.name}?`, 'All of its games and history will be deleted for everyone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => api(`groups?id=${g.id}`, { method: 'DELETE' }).then(() => router.back(), e => Alert.alert('Couldn’t delete', e.message)) }]) }
        : { text: 'Leave group', style: 'destructive', onPress: () => Alert.alert(`Leave ${g.name}?`, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => api(`groups?id=${g.id}&action=leave`, { method: 'POST', body: {} }).then(() => router.back(), e => Alert.alert('Couldn’t leave', e.message)) }]) },
      { text: 'Cancel', style: 'cancel' },
    ];
    Alert.alert(g.name, undefined, buttons);
  }, [data, share, load]);
  useLayoutEffect(() => {
    nav.setOptions({ title: data?.group.name || '', headerRight: () => <Pressable onPress={more} hitSlop={10} accessibilityLabel="Group options"><Ionicons name="ellipsis-horizontal-circle" size={26} color={c.brand} /></Pressable> });
  }, [nav, data, more, c]);

  if (!data && !err) return <Loading />;
  if (!data) return <Screen><ErrorText>{err}</ErrorText></Screen>;
  const g = data.group, admin = data.me.admin;
  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <Row style={{ gap: 14 }}>
        <View style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 32 }}>{sportIcon(g.sport)}</T></View>
        <View style={{ flex: 1 }}><T kind="title" style={{ fontSize: 26 }} accessibilityRole="header">{g.name}</T><T kind="small" style={{ fontSize: 15 }}>{[SPORTS[g.sport]?.[0], g.location].filter(Boolean).join(' · ')}</T></View>
      </Row>
      {!!g.about && <T style={{ color: c.ink2 }}>{g.about}</T>}
      {admin && data.members.length < 3 && (
        <Card style={{ backgroundColor: c.brandSoft, borderColor: c.brand, gap: 10 }}>
          <T kind="h3">Invite your players</T>
          <T kind="small" style={{ color: c.ink2 }}>Send the link to your group chat. Anyone with it can join.</T>
          <Button title="Share invite link" onPress={share} />
        </Card>
      )}
      <Segmented options={[['games', 'Games'], ['table', 'Table'], ['members', `Members ${data.members.length}`]]} value={tab} onChange={setTab} />
      {tab === 'games' && <>
        {admin && <Button title="+ Post a game" onPress={() => router.push({ pathname: '/game-form', params: { groupId: g.id } })} />}
        {data.upcoming.length === 0 ? <Empty title="No games scheduled">{admin ? 'Post one and everyone in the group can answer.' : 'Your organizer hasn’t posted the next game yet.'}</Empty>
          : data.upcoming.map(x => <GameCard key={x.id} g={x} />)}
        {data.past.length > 0 && <><T kind="h2" style={{ marginTop: 8 }}>Past games</T>{data.past.map(x => <GameCard key={x.id} g={x} />)}</>}
      </>}
      {tab === 'table' && <Table stats={data.stats} me={data.me.userId} c={c} />}
      {tab === 'members' && <>
        {admin && <Button kind="ghost" title="Share invite link" onPress={share} />}
        <Members data={data} reload={load} c={c} />
      </>}
    </Screen>
  );
}
