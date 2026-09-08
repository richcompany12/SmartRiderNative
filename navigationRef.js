import { createNavigationContainerRef } from '@react-navigation/native';

// 네비게이터 "바깥"에서도 화면을 이동시키기 위한 참조.
// ProximityNotifier는 Stack.Navigator 밖에 있어서 navigation prop을 못 받는다.
// 그래서 이 ref를 통해 이동한다.
export const navigationRef = createNavigationContainerRef();

// 화면 이동. 네비게이터가 아직 준비 안 됐으면 false를 돌려준다.
export function navigateTo(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
    return true;
  }
  console.log('[NAV] 아직 준비 안 됨:', name);
  return false;
}