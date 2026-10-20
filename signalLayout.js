// signalLayout.js
// ★ 사거리 신호 순서 (10-20) — 아이콘 줄 계산. 등록 화면 미리보기가 쓴다.
// ⚠️ 코틀린 토스트(ProximityOverlayService.kt)도 똑같은 계산을 한다. 한쪽을 바꾸면 다른 쪽도 같이.
//
//  - 나는 항상 아래에서 위로 간다.
//  - 다른 진입로 화살표는 "중심 → 그 진입로 핀" 방향 차이만큼 돌린다 (실제 각도).
//  - 내 진입로가 움직이는 단계 = 내 칸 (주황). 나머지 파랑.
//  - 신호는 순환이라 시작점을 돌려서 내 칸을 가운데에 둔다.

export const MOVES = ['S', 'L', 'SL'];                    // 직진 / 좌회전 / 직좌
export const MOVE_LABEL = { S: '직진', L: '좌회전', SL: '직좌' };
export const APPROACH_NAMES = ['홈', '1루', '2루', '3루', '5번'];
export const DEFAULT_RADIUS = 20;
export const MAX_APPROACHES = 5;

// 중심에서 본 방향 (정북 0도, 시계방향, 0~360)
export const bearingDeg = (from, to) => {
  const toRad = (d) => d * Math.PI / 180;
  const lat1 = toRad(from.lat), lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// 내 진입로 기준으로 다른 진입로 화살표를 몇 도 돌릴지 (시계방향 +)
//   진행 방향 = 진입로 핀 → 중심. 회전 = (그 진입로 진행 방향 − 내 진행 방향)
//   내 진입로 = 0 (위쪽), 맞은편 = 180 (아래쪽), 오른쪽에서 오는 차 = -90 (왼쪽으로 감)
//   ★ 10-20 대표님: 진입로 4개 이하(삼거리·사거리)는 가장 가까운 90도로 맞춘다. 오거리(5개)만 실제 각도
export const relAngle = (center, mine, other, approachCount = 4) => {
  const r = bearingDeg(center, other) - bearingDeg(center, mine);
  const deg = ((r % 360) + 540) % 360 - 180;   // -180 ~ 180
  if (approachCount >= 5) return deg;
  const snapped = Math.round(deg / 90) * 90;
  return snapped === -180 ? 180 : snapped;
};

// 진입로가 이 단계에서 움직이는지
const movesIn = (phase, key) => !!(phase && phase.moves && phase.moves[key]);

// 단계 순서를 돌려서 내 칸을 가운데로.
//   반환: [{ index(원래 단계 번호), mine }]  — 화면 왼쪽부터 순서대로
//   시작 칸 = (전체 칸 수 - 내 칸 수 + 1) / 2 를 버림
//     4칸·1개 → 3번 / 4칸·2개 → 2·3번 / 5칸·1개 → 3번 / 5칸·2개 → 3·4번
//   내 칸이 떨어져 있으면 첫 번째 묶음 기준. 한 칸도 없거나 전부 내 칸이면 그대로
export const arrangePhases = (phases, myKey) => {
  const n = phases.length;
  const mine = phases.map(p => movesIn(p, myKey));
  const plain = () => phases.map((_, i) => ({ index: i, mine: mine[i] }));
  if (n === 0 || !myKey) return plain();
  const count = mine.filter(Boolean).length;
  if (count === 0 || count === n) return plain();

  // 첫 번째 묶음의 시작: 내 칸인데 바로 앞(순환)이 내 칸이 아닌 첫 자리
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (mine[i] && !mine[(i - 1 + n) % n]) { start = i; break; }
  }
  let k = 0;
  while (k < n && mine[(start + k) % n]) k++;

  const target = Math.floor((n - k + 1) / 2);
  const out = [];
  for (let j = 0; j < n; j++) {
    const idx = ((start - target + j) % n + n) % n;
    out.push({ index: idx, mine: mine[idx] });
  }
  return out;
};
