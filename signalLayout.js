// signalLayout.js
// ★ 사거리 신호 순서 (10-20) — 아이콘 줄 계산. 등록 화면 미리보기가 쓴다.
// ⚠️ 같은 계산이 세 군데 있다: 앱 이 파일 / 코틀린 토스트(ProximityOverlayService.kt) / 웹 어드민(D:\app\SmartRiderAdmin\src\signalLayout.js, 이 파일 복사본)
//    하나 고치면 셋 다 고친다. 웹 쪽은 이 파일을 그대로 다시 복사하면 된다.
//
//  - 나는 항상 아래에서 위로 간다.
//  - 다른 진입로 화살표는 "중심 → 그 진입로 핀" 방향 차이만큼 돌린다 (실제 각도).
//  - 내 진입로가 움직이는 단계 = 내 칸 (초록, 10-21 주황→초록). 나머지 파랑. 접힌 토스트의 앞 신호는 회색
//  - 신호는 순환이라 시작점을 돌려서 내 칸을 가운데에 둔다.

export const MOVES = ['S', 'L', 'SL'];                    // 직진 / 좌회전 / 직좌
export const MOVE_LABEL = { S: '직진', L: '좌회전', SL: '직좌' };
// ★ 10-20 — 진입로 이름은 "정지선 N" (찍은 순서). 홈·1루·2루·3루는 대표님·오실장 설명용 말이라 앱엔 안 씀
export const approachName = (index) => '정지선 ' + (index + 1);

// 중심에서 본 8방위 ("북쪽", "남동쪽" …) — CCTV 보면서 입력할 때 헷갈리지 않게
const DIR8 = ['북쪽', '북동쪽', '동쪽', '남동쪽', '남쪽', '남서쪽', '서쪽', '북서쪽'];
export const compass8 = (center, point) => DIR8[Math.round(bearingDeg(center, point) / 45) % 8];
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

// ★ 10-21 — 접힌 토스트: "앞 신호 1칸 → 내 차례 칸들"
//   내 차례 = 첫 번째 내 칸 묶음 (연달아 2개면 2개 다). 앞 신호 = 그 바로 전 단계 (순환)
//   반환: { prev: 단계 번호 | null, mine: [단계 번호…] }. 내 칸이 없으면 mine = []
//   전부 내 칸이면 앞 신호 없음
export const collapsedPhases = (phases, myKey) => {
  const n = phases.length;
  const mine = phases.map(p => movesIn(p, myKey));
  const count = mine.filter(Boolean).length;
  if (n === 0 || count === 0) return { prev: null, mine: [] };
  if (count === n) return { prev: null, mine: phases.map((_, i) => i) };
  let start = 0;
  for (let i = 0; i < n; i++) {
    if (mine[i] && !mine[(i - 1 + n) % n]) { start = i; break; }
  }
  const run = [];
  for (let k = 0; k < n && mine[(start + k) % n]; k++) run.push((start + k) % n);
  return { prev: (start - 1 + n) % n, mine: run };
};

// 회전 각도 → 내 기준 방향 말. 오거리 실제 각도도 가장 가까운 말로
//   180 = 맞은편, -90 = 오른쪽에서 오는 차, +90 = 왼쪽에서 오는 차
export const sideWord = (rot) => {
  const r = Math.round(rot / 90) * 90;
  if (r === 0) return '같은 방향';
  if (r === 90) return '왼쪽';
  if (r === -90) return '오른쪽';
  return '맞은편';
};

// 앞 신호 글자: "맞은편 직좌", "맞은편·왼쪽 직진", "맞은편 직좌 · 왼쪽 직진"
export const prevCaption = (signal, myKey, phaseIndex) => {
  const approaches = signal.approaches || [];
  const mineA = approaches.find(a => a.key === myKey);
  const moves = signal.phases?.[phaseIndex]?.moves || {};
  if (!mineA) return '';
  const byMove = {};
  for (const [key, mv] of Object.entries(moves)) {
    const ap = approaches.find(a => a.key === key);
    if (!ap) continue;
    const word = sideWord(relAngle(signal.center, mineA, ap, approaches.length));
    (byMove[mv] = byMove[mv] || []).push(word);
  }
  return MOVES.filter(mv => byMove[mv]).map(mv => byMove[mv].join('·') + ' ' + MOVE_LABEL[mv]).join(' · ');
};
