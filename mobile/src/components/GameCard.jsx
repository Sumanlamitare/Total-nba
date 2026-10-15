import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, T, MyChip, Meter } from './ui';
import { useColors, font } from '../lib/theme';
import { relDay, clock, sportIcon } from '../lib/format';

export default function GameCard({ g, showGroup }) {
  const c = useColors(), full = g.taken >= g.capacity;
  const line = g.status === 'canceled' ? 'Canceled' : g.status === 'played' ? (g.score ? `Final ${g.score.join(' – ')}` : 'Played')
    : `${g.taken}/${g.capacity} in${g.waitlist ? ` · ${g.waitlist} waiting` : ''}${g.need ? ` · need ${g.need}` : full ? ' · full' : ''}`;
  return (
    <Card onPress={() => router.push(`/game/${g.id}`)} accessibilityLabel={`${showGroup ? g.groupName + ', ' : ''}${relDay(g.startsAt)} ${clock(g.startsAt)}, ${line}`}
      style={[{ flexDirection: 'row', gap: 14 }, g.status === 'canceled' && { opacity: 0.55 }]}>
      <View style={{ width: 84 }}>
        <T style={[font.heavy, { fontSize: 17 }]}>{relDay(g.startsAt)}</T>
        <T kind="small" style={font.semi}>{clock(g.startsAt)}</T>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        {showGroup && <T style={[font.bold, { fontSize: 13, color: c.ink2 }]} numberOfLines={1}>{sportIcon(g.sport)} {g.groupName}</T>}
        <T style={font.semi} numberOfLines={1}>{g.location || 'Location TBA'}</T>
        <T kind="small" style={g.status === 'canceled' && { color: c.bad }}>{line}</T>
        {g.status === 'scheduled' && <><Meter value={g.taken} max={g.capacity} /><View style={{ marginTop: 4 }}><MyChip me={g.me} /></View></>}
      </View>
    </Card>
  );
}
