import { useColorScheme } from 'react-native';

const light = {
  bg: '#f5f3ee', panel: '#ffffff', panel2: '#efece5', line: '#e4e0d6', line2: '#d2cdc1',
  ink: '#15161a', ink2: '#45474f', muted: '#7a7c84',
  brand: '#ff5a1f', brandDark: '#d9430c', brandSoft: '#ffe8de',
  in: '#14945a', inBg: '#dcf4e7', wait: '#b8740a', waitBg: '#fbeed3', maybe: '#5b63d6', maybeBg: '#e6e7fb', out: '#8a8c93', outBg: '#ecebe7', bad: '#d23a2f', badBg: '#fbe3e1',
};
const dark = {
  bg: '#0f1013', panel: '#191a1f', panel2: '#23252b', line: '#2a2c33', line2: '#3a3d45',
  ink: '#f2f1ee', ink2: '#c3c4c9', muted: '#8d8f97',
  brand: '#ff5a1f', brandDark: '#ff7a47', brandSoft: 'rgba(255,90,31,0.18)',
  in: '#3fcf88', inBg: 'rgba(63,207,136,0.16)', wait: '#f2b54a', waitBg: 'rgba(242,181,74,0.16)', maybe: '#9aa0ff', maybeBg: 'rgba(154,160,255,0.16)', out: '#9a9ca3', outBg: 'rgba(154,156,163,0.15)', bad: '#ff6b5f', badBg: 'rgba(255,107,95,0.16)',
};
export const useColors = () => (useColorScheme() === 'dark' ? dark : light);
export const font = { black: { fontWeight: '900', letterSpacing: -0.5 }, heavy: { fontWeight: '800' }, bold: { fontWeight: '700' }, semi: { fontWeight: '600' } };
