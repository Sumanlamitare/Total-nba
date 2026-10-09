// Team colours (bright enough to read on black), keyed by ESPN's short team name. Old franchises included.
const C = {
  Hawks: '#E03A3E', Celtics: '#00A651', Nets: '#B8BCC2', Hornets: '#00A3B4', Bobcats: '#F26532', Bulls: '#E0194B',
  Cavaliers: '#C2185B', Mavericks: '#1E88E5', Nuggets: '#FEC524', Pistons: '#2F5BEA', Warriors: '#FFC72C',
  Rockets: '#E4002B', Pacers: '#FDBB30', Clippers: '#E8384F', Lakers: '#A06CD5', Grizzlies: '#7D9CD6', Heat: '#E8344E',
  Bucks: '#3AA867', Timberwolves: '#3D8BD3', Pelicans: '#C9A962', Knicks: '#F58426', Thunder: '#2BA3F0',
  Magic: '#1E90E0', '76ers': '#2E7FE0', Suns: '#F26A21', 'Trail Blazers': '#F0414B', Kings: '#8B5CC4',
  Spurs: '#C4CED4', Raptors: '#E21E45', Jazz: '#5B8DEF', Wizards: '#E8394B', Bullets: '#E8394B', SuperSonics: '#22B26B',
};
export const teamColor = t => C[t] || '#FF6B1A';
