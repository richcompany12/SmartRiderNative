// ★ v6.1 — 키보드가 입력 칸을 가리지 않게 하는 공통 부품 (ScrollView 대신 씀)
// 안드로이드 15부터는 화면 끝까지 그리기(edge-to-edge) 때문에 adjustResize가 안 먹어서
// 키보드가 올라와도 화면이 줄지 않는다. 그래서 키보드가 덮는 높이만큼 아래를 직접 띄운다.
// 화면이 이미 줄어드는 폰에선 겹치는 높이가 0이라 아무것도 안 한다.
// 누른 칸이 키보드 밑에 있으면 키보드 위로 스크롤해 준다.
import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Keyboard, TextInput, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

export default function KeyboardScreen({
  children, style, extraGap = 24, scrollRef: outerScrollRef, onScroll, revealFor, ...rest
}) {
  // revealFor(input): 이 칸을 눌렀을 때 대신 끝까지 보여줄 묶음 View를 돌려준다 (없으면 null)
  const revealForRef = useRef(revealFor);
  revealForRef.current = revealFor;
  const boxRef = useRef(null);
  const innerScrollRef = useRef(null);
  const scrollRef = outerScrollRef || innerScrollRef;
  const scrollY = useRef(0);
  const kbTop = useRef(null);     // 키보드 윗변 (화면 기준, 안 떠 있으면 null)
  const gapRef = useRef(extraGap);
  gapRef.current = extraGap;
  const isFocused = useIsFocused();
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;
  const [pad, setPad] = useState(0);

  // 이 부품의 아래쪽이 키보드에 얼마나 덮이는지 재서 그만큼 띄운다
  const measure = () => {
    const box = boxRef.current;
    if (!box) return;
    if (kbTop.current == null) { setPad(0); return; }
    box.measureInWindow((x, y, w, h) => {
      if (kbTop.current == null) return;
      const p = Math.max(0, Math.round(y + h - kbTop.current));
      setPad(p);
    });
  };

  // 지금 커서가 있는 칸이 키보드 밑이면 위로 올린다 (칸 아래 extraGap만큼 더 보이게)
  const reveal = () => {
    const input = TextInput.State.currentlyFocusedInput?.();
    const box = boxRef.current;
    if (!input || !box || kbTop.current == null) return;
    // 칸 대신 더 큰 묶음을 보여줘야 할 때 (도착 메모 1·2 + 단축 버튼)
    const group = revealForRef.current?.(input) || null;
    const target = group || input;
    // 묶음은 맨 아래 여유 40 — 키보드 윗부분 막대가 신호보다 20쯤 더 올라와 아랫줄이 반만 보였음 (10-19 공기계)
    const gap = group ? 40 : gapRef.current;
    box.measureInWindow((bx, by, bw, bh) => {
      input.measureInWindow((ix, iy, iw, ih) => {
        target.measureInWindow((tx, ty, tw, th) => {
          if (kbTop.current == null) return;
          const visibleBottom = Math.min(by + bh, kbTop.current);
          const over = ty + th + gap - visibleBottom;
          const room = Math.max(0, iy - by - 8);    // 누른 칸 윗부분이 화면 위로 넘어가지 않게
          const d = Math.min(over, room);
          if (d > 0) scrollRef.current?.scrollTo({ y: scrollY.current + d, animated: true });
        });
      });
    });
  };

  // 키보드가 떠 있는 동안 커서가 다른 칸으로 옮겨가면 그 칸도 올린다
  // (안드로이드는 키보드가 처음 뜰 때만 신호를 주고, 칸을 옮길 땐 신호가 없어서 0.2초마다 확인)
  const lastInput = useRef(null);
  const timer = useRef(null);
  const startWatch = () => {
    if (timer.current) return;
    lastInput.current = TextInput.State.currentlyFocusedInput?.() || null;
    timer.current = setInterval(() => {
      if (!focusedRef.current || kbTop.current == null) return;
      const now = TextInput.State.currentlyFocusedInput?.() || null;
      if (now && now !== lastInput.current) {
        lastInput.current = now;
        setTimeout(reveal, 80);
      }
    }, 200);
  };
  const stopWatch = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    lastInput.current = null;
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', e => {
      kbTop.current = e.endCoordinates.screenY;
      if (!focusedRef.current) return;      // 뒤에 깔린 화면은 건드리지 않는다
      measure();
      setTimeout(reveal, 150);
      setTimeout(reveal, 450);              // 키보드가 다 올라온 뒤 한 번 더
      startWatch();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbTop.current = null;
      setPad(0);
      stopWatch();
    });
    return () => { show.remove(); hide.remove(); stopWatch(); };
  }, []);

  return (
    <View
      ref={boxRef}
      style={[{ flex: 1 }, style, { paddingBottom: pad }]}
      onLayout={measure}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; onScroll?.(e); }}
        {...rest}
      >
        {children}
      </ScrollView>
    </View>
  );
}
