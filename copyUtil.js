import * as Clipboard from 'expo-clipboard';
import { Platform, ToastAndroid, Alert } from 'react-native';

/**
 * copyUtil.js
 *
 * 목록에서 출입 정보를 복사하는 기능.
 * 873동을 찾다 없으면 872, 871을 눌러보며 비번을 복사하는 흐름이라
 * 홈과 조회 양쪽에서 쓴다.
 */

export const say = (msg) => {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert('', msg);
};

export const copyBuildingMemo = async (item) => {
  const text = [item?.memo, item?.memo2].filter(v => (v || '').trim()).join('  /  ');
  if (!text) {
    say('복사할 메모가 없습니다');
    return false;
  }
  await Clipboard.setStringAsync(text);
  say(`복사됨 · ${text}`);
  return true;
};