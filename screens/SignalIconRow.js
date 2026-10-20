// screens/SignalIconRow.js
// ★ 사거리 신호 순서 (10-20) — 아이콘 줄 (등록 화면 미리보기)
// 토스트(코틀린)와 같은 모양·같은 계산 (signalLayout.js)
//
// 화살표 = 오실장 확정 좌표 (48×48 칸, 아래 → 위가 내 방향). SVG 부품이 없어서 같은 좌표로 조각을 맞춰 그린다
//   직진  : M32 44 V16 (굵기 5.5, 둥근 끝) + 삼각형 32,3 / 39,16 / 25,16
//   좌회전: M32 44 V38 Q32 30 24 30 H16 + 삼각형 4,30 / 16,23 / 16,37
//   직좌  : 둘 다
//   다른 진입로는 칸 가운데(24,24) 기준 회전. 화살표가 오른쪽(x=32)에 붙어 있어 맞은편(x=16)과 안 겹친다
//   색: 내 방향 주황 #D85A30 / 다른 방향 파랑 #378ADD. 칸 테두리는 내 방향이 있으면 주황
import { View, Text, StyleSheet } from 'react-native';
import { arrangePhases, relAngle } from '../signalLayout';

export const SIGNAL_ORANGE = '#D85A30';
export const SIGNAL_BLUE = '#378ADD';
const G = 48;          // 그리는 칸 크기 (좌표 기준)
const W = 5.5;         // 선 굵기
const H = W / 2;
const R = 8;           // 좌회전 곡선 반지름 (Q32 30 → 중심 24,38)

// 아래 → 위 방향 화살표 하나 (48×48 좌표 그대로)
function ArrowShape({ move, color }) {
  const straight = move === 'S' || move === 'SL';
  const left = move === 'L' || move === 'SL';
  const ringOuter = R + H;
  return (
    <View style={st.grid} pointerEvents="none">
      {/* 아래 둥근 끝 + 세로줄 (직진은 16까지, 좌회전만이면 38까지) */}
      <View style={[st.abs, { left: 32 - H, top: 44 - H, width: W, height: W, borderRadius: H, backgroundColor: color }]} />
      <View style={[st.abs, { left: 32 - H, top: straight ? 16 : 38, width: W, height: straight ? 28 : 6, backgroundColor: color }]} />
      {straight && (
        <View style={[st.abs, st.tri, {
          left: 25, top: 3, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 13, borderBottomColor: color,
        }]} />
      )}
      {left && (
        <>
          {/* 곡선: 중심 (24,38) 반지름 8 원의 오른쪽 위 4분의 1 */}
          <View style={[st.abs, { left: 24, top: 38 - ringOuter, width: ringOuter, height: ringOuter, overflow: 'hidden' }]}>
            <View style={{
              position: 'absolute', left: -ringOuter, top: 0, width: ringOuter * 2, height: ringOuter * 2,
              borderRadius: ringOuter, borderWidth: W, borderColor: color,
            }} />
          </View>
          {/* 가로줄 24 → 16 */}
          <View style={[st.abs, { left: 16, top: 30 - H, width: 8.5, height: W, backgroundColor: color }]} />
          <View style={[st.abs, st.tri, {
            left: 4, top: 23, borderTopWidth: 7, borderBottomWidth: 7, borderRightWidth: 12, borderRightColor: color,
          }]} />
        </>
      )}
    </View>
  );
}

export default function SignalIconRow({ signal, myKey }) {
  const phases = signal?.phases || [];
  const approaches = signal?.approaches || [];
  const center = signal?.center;
  const mineA = approaches.find(a => a.key === myKey);
  if (!phases.length || !center || !mineA) return null;

  const order = arrangePhases(phases, myKey);
  return (
    <View style={st.row}>
      {order.map(({ index, mine }, j) => {
        const moves = phases[index]?.moves || {};
        // 다른 방향 먼저, 내 방향을 맨 위에
        const entries = Object.entries(moves).sort(([a], [b]) => (a === myKey) - (b === myKey));
        return (
          <View key={j} style={st.cellWrap}>
            <View style={[st.cell, { borderColor: mine ? SIGNAL_ORANGE : SIGNAL_BLUE }]}>
              {entries.map(([key, move]) => {
                const ap = approaches.find(a => a.key === key);
                if (!ap) return null;
                const rot = key === myKey ? 0 : relAngle(center, mineA, ap, approaches.length);
                return (
                  <View key={key} style={[st.grid, { transform: [{ rotate: rot + 'deg' }] }]}>
                    <ArrowShape move={move} color={key === myKey ? SIGNAL_ORANGE : SIGNAL_BLUE} />
                  </View>
                );
              })}
            </View>
            <Text style={[st.num, { color: mine ? SIGNAL_ORANGE : SIGNAL_BLUE }]}>{index + 1}</Text>
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cellWrap: { alignItems: 'center' },
  cell: {
    width: G + 4, height: G + 4, borderRadius: 10, borderWidth: 2,
    backgroundColor: '#FFFFFF', overflow: 'hidden',
  },
  grid: { position: 'absolute', left: 0, top: 0, width: G, height: G },
  abs: { position: 'absolute' },
  tri: {
    width: 0, height: 0, backgroundColor: 'transparent',
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
  },
  num: { fontSize: 11, marginTop: 2, fontWeight: '600' },
});
