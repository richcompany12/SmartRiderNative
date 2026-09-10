import { ref, get, set } from 'firebase/database';
import { db } from './firebase';
import { ADMIN_UID, ADMIN_UIDS } from './constants';

// ─────────────────────────────────────────────────────────
//  역할
//
//  예전에는 constants.js에 UID를 직접 적어뒀는데, 그러면 어드민을
//  한 명 늘릴 때마다 앱을 새로 빌드해서 배포해야 한다.
//  이제 Firebase의 users/{uid}/role 을 본다. 앱에서 임명하면 끝.
//
//  ⚠️ 앱에서 역할을 검사하는 것만으로는 보안이 되지 않는다.
//     Firebase 보안 규칙에서도 똑같이 막아야 한다.
// ─────────────────────────────────────────────────────────

export const ROLE = {
  SUPER: 'superadmin',   // 전부 + 어드민 임명/해제
  ADMIN: 'admin',        // 공용 건물·알림지점 등록/수정/삭제, 제보 승인
  VERIFIED: 'verified',  // 제보 가능 (신뢰도 쌓인 사용자)
  USER: 'user',          // 개인 데이터만
};

const USERS_PATH = 'users';

// Firebase에 역할이 아직 없는 사람을 위한 대비책.
// 기존 ADMIN_UIDS에 있던 사람은 그대로 어드민으로 인정한다.
const fallbackRole = (uid) => {
  if (uid === ADMIN_UID) return ROLE.SUPER;
  if (ADMIN_UIDS.includes(uid)) return ROLE.ADMIN;
  return ROLE.USER;
};

export const getRole = async (uid) => {
  if (!uid) return ROLE.USER;
  try {
    const snap = await get(ref(db, `${USERS_PATH}/${uid}/role`));
    const saved = snap.exists() ? snap.val() : null;
    if (saved && Object.values(ROLE).includes(saved)) return saved;
  } catch (e) {
    console.log('[ROLE] 역할 조회 실패, 기본값 사용', e?.message || e);
  }
  return fallbackRole(uid);
};

// 로그인할 때 프로필을 만들어둔다.
// 역할은 이미 있으면 건드리지 않는다 (사용자가 자기 역할을 올릴 수 없게)
export const ensureUserProfile = async (user) => {
  if (!user?.uid) return;
  try {
    const profileRef = ref(db, `${USERS_PATH}/${user.uid}`);
    const snap = await get(profileRef);
    if (snap.exists()) return;
    await set(profileRef, {
      email: user.email || '',
      role: fallbackRole(user.uid),
      createdAt: Date.now(),
    });
  } catch (e) {
    console.log('[ROLE] 프로필 생성 실패', e?.message || e);
  }
};

// ── 권한 판별 ──
// 화면에서는 역할 이름을 직접 비교하지 말고 아래 함수를 쓴다.
// 나중에 규칙이 바뀌어도 여기만 고치면 된다.

export const isSuper = (role) => role === ROLE.SUPER;

export const isAdmin = (role) => role === ROLE.SUPER || role === ROLE.ADMIN;

// 공용 건물 / 강력알림 지점을 직접 등록·수정·삭제할 수 있는가
export const canEditPublic = (role) => isAdmin(role);

// 제보를 올릴 수 있는가 (지금은 로그인만 하면 누구나)
export const canReport = (role) => !!role;

// 제보를 승인해서 공용으로 올릴 수 있는가
export const canApprove = (role) => isAdmin(role);

// 어드민을 임명·해제할 수 있는가
export const canManageRoles = (role) => isSuper(role);

export const roleLabel = (role) => {
  switch (role) {
    case ROLE.SUPER: return '슈퍼관리자';
    case ROLE.ADMIN: return '관리자';
    case ROLE.VERIFIED: return '검증 사용자';
    default: return '사용자';
  }
};