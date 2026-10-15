import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen, T, Card, Button, Empty, ErrorText, Row, Loading } from '../../components/ui';
import GameCard from '../../components/GameCard';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useColors, font } from '../../lib/theme';
import { registerForPush } from '../../lib/push';
import { relDay, clock, sportIcon } from '../../lib/format';

export default function Home() {
  const { user } = useSession(), c = useColors();
  const [data, setData] = useState(null), [err, setErr] = useState(''), [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { const [g, gr] = await Promise.all([api('games'), api('groups')]); setData({ games: g.games, groups: gr.groups }); setErr(''); }
    catch (e) { setErr(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { registerForPush({ ask: true }); }, []); // asks once; iOS remembers the answer

  if (!data && !err) return <Loading />;
  const games = data?.games || [], groups = data?.groups || [];
  const waiting = games.filter(g => g.status === 'scheduled' && !g.me).length;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen inset="never" refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
        <View style={{ gap: 2 }}>
          <T kind="title" accessibilityRole="header">Hey {user.name.split(' ')[0]} 👋</T>
          <T kind="small" style={{ fontSize: 15 }}>{games.length ? `${games.length} upcoming game${games.length > 1 ? 's' : ''}${waiting ? ` · ${waiting} waiting on your answer` : ''}` : 'No games on the calendar yet.'}</T>
        </View>
        <ErrorText>{err}</ErrorText>
        {data && groups.length === 0 ? (
          <Empty title="Start your first group" action={<View style={{ gap: 10, alignSelf: 'stretch' }}><Button title="Start a group" onPress={() => router.push('/new-group')} /><Button kind="ghost" title="I have an invite link" onPress={() => router.push('/join-link')} /></View>}>
            A group is your regular crew — Sunday soccer, lunchtime hoops, the Thursday pickleball ladies.
          </Empty>
        ) : data && <>
          <T kind="h2" accessibilityRole="header">Upcoming</T>
          {games.length === 0 ? <Card><T style={{ color: c.ink2 }}>Nothing scheduled. Organizers can post a game from the group.</T></Card>
            : games.map(g => <GameCard key={g.id} g={g} showGroup />)}
          <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <T kind="h2" accessibilityRole="header">Your groups</T>
            <Row><Button small kind="ghost" title="Join" onPress={() => router.push('/join-link')} /><Button small title="+ New" onPress={() => router.push('/new-group')} /></Row>
          </Row>
          {groups.map(g => (
            <Card key={g.id} onPress={() => router.push(`/group/${g.id}`)} accessibilityLabel={g.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 26 }}>{sportIcon(g.sport)}</T></View>
              <View style={{ flex: 1, gap: 2 }}>
                <T style={font.heavy} numberOfLines={1}>{g.name}</T>
                <T kind="small">{g.members} member{g.members > 1 ? 's' : ''}{g.role !== 'member' ? ` · ${g.role === 'owner' ? 'Owner' : 'Organizer'}` : ''}</T>
                <T kind="small" style={{ color: c.ink2 }}>{g.next ? `Next: ${relDay(g.next.startsAt)} ${clock(g.next.startsAt)} · ${g.next.taken}/${g.next.capacity}` : 'No game scheduled'}</T>
              </View>
            </Card>
          ))}
        </>}
      </Screen>
    </SafeAreaView>
  );
}
