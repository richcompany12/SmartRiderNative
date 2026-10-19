// ★ v6.1 — 숫자판 갇힘 공통 규칙
// 일부 키보드는 숫자 칸에서 글자 칸으로 넘어가도 숫자판을 그대로 둔다.
// 그래서 "지금 숫자판이 떠 있는지"를 앱 전체에서 하나만 기억하고,
// 글자 칸에 들어왔을 때 숫자판이면 키보드를 내렸다 올려서 글자판으로 바꾼다.
// (등록 화면 안에서만 기억하던 걸 검색·단축 버튼 편집 창까지 넓힌 것)
import { Keyboard, TextInput } from 'react-native';

let numericUp = false;

// 키보드가 내려가면 다음 칸은 새로 뜨니까 잊는다
Keyboard.addListener('keyboardDidHide', () => { numericUp = false; });

// 숫자판을 쓸 수 있는 칸(등록 메모, 검색)의 onFocus에서 부른다
export const markKeyboard = (isNumeric) => { numericUp = !!isNumeric; };

// 글자 칸의 onFocus에서 부른다. ref 객체나 입력칸을 돌려주는 함수를 받는다
// 아무것도 안 넘기면 지금 커서가 있는 칸을 쓴다 (ref 없는 칸용)
export const fixTextKeyboard = (ref) => {
  if (!numericUp) return;
  numericUp = false;
  const now = ref ? null : TextInput.State.currentlyFocusedInput?.();
  const get = () => (ref ? (typeof ref === 'function' ? ref() : ref.current) : now);
  get()?.blur();
  setTimeout(() => get()?.focus(), 80);
};
