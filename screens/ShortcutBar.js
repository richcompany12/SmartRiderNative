// screens/ShortcutBar.js
// 사용자가 직접 만드는 단축 버튼 줄.
//
//  - 탭: 글자를 넣는다 (onPick)
//  - 길게 누르기: 이름 바꾸기 / 삭제
//  - + 버튼: 새 버튼 추가
//
// 기본값 '길게' '눌러' '수정' 은 그 자체가 사용법 안내다.
// 앱이 어떤 내용을 적으라고 권하지 않는다. 무엇을 넣을지는 라이더가 정한다.
//
// storageKey 가 같으면 여러 화면이 같은 목록을 쓴다.
//   'shortcuts_name' : 건물 이름 (등록 · 상세 수정 · 검색)
//   'shortcuts_memo' : 도착 메모 (등록 · 상세 수정)
// 저장은 폰(AsyncStorage)에만 한다.

import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, StyleSheet, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme';

const DEFAULTS = ['길게', '눌러', '수정'];
const MAX_ITEMS = 12;
const MAX_LEN = 10;

// 같은 목록을 쓰는 화면들이 동시에 바뀌도록 알려주는 장치
const listeners = {};
const subscribe = (key, fn) => {
  (listeners[key] = listeners[key] || new Set()).add(fn);
  return () => listeners[key].delete(fn);
};
const notify = (key, arr) => listeners[key]?.forEach(fn => fn(arr));

export default function ShortcutBar({ storageKey, onPick }) {
  const { c, font, space, radius } = useTheme();
  const s = useMemo(() => makeStyles(c, font, space, radius), [c]);

  const [items, setItems] = useState(DEFAULTS);
  const [editIndex, setEditIndex] = useState(null);   // null: 닫힘 / -1: 추가 / 0~: 수정
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw && alive) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setItems(arr);
        }
      } catch (e) {}
    })();
    const off = subscribe(storageKey, setItems);
    return () => { alive = false; off(); };
  }, [storageKey]);

  const save = async (next) => {
    notify(storageKey, next);
    try { await AsyncStorage.setItem(storageKey, JSON.stringify(next)); } catch (e) {}
  };

  const openAdd = () => {
    if (items.length >= MAX_ITEMS) {
      Alert.alert('알림', `단축 버튼은 ${MAX_ITEMS}개까지 만들 수 있어요.`);
      return;
    }
    setDraft('');
    setEditIndex(-1);
  };

  const openEdit = (i) => {
    setDraft(items[i]);
    setEditIndex(i);
  };

  const close = () => setEditIndex(null);

  const confirm = () => {
    const v = draft.trim();
    if (!v) { close(); return; }
    if (editIndex === -1) save([...items, v]);
    else save(items.map((x, i) => (i === editIndex ? v : x)));
    close();
  };

  const remove = () => {
    save(items.filter((_, i) => i !== editIndex));
    close();
  };

  return (
    <>
      <View style={s.grid}>
        {items.map((label, i) => (
          <TouchableOpacity
            key={`${label}_${i}`}
            style={s.key}
            onPress={() => onPick(label)}
            onLongPress={() => openEdit(i)}
            delayLongPress={400}
          >
            <Text style={s.keyText}>{label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.key, s.addKey]} onPress={openAdd}>
          <Text style={[s.keyText, s.addText]}>+</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={editIndex !== null} transparent animationType="fade" onRequestClose={close}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <Text style={s.title}>{editIndex === -1 ? '단축 버튼 추가' : '단축 버튼 수정'}</Text>
            <TextInput
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              maxLength={MAX_LEN}
              autoFocus
              placeholder="버튼에 넣을 글자"
              placeholderTextColor={c.textFaint}
              onSubmitEditing={confirm}
            />
            <Text style={s.hint}>{MAX_LEN}자까지 · 이 폰에만 저장됩니다</Text>

            <View style={s.row}>
              {editIndex !== null && editIndex >= 0 && (
                <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={remove}>
                  <Text style={s.btnDangerText}>삭제</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={s.btn} onPress={close}>
                <Text style={s.btnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={confirm}>
                <Text style={s.btnPrimaryText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (c, font, space, radius) => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  key: {
    minHeight: 38, justifyContent: 'center', paddingHorizontal: space.md,
    backgroundColor: c.surfaceSoft, borderRadius: radius.sm,
  },
  keyText: { ...font.sub, color: c.text },
  addKey: {
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.accent,
    paddingHorizontal: space.md + 2,
  },
  addText: { color: c.accent, fontWeight: '500' },

  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', padding: space.xl,
  },
  sheet: { backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg },
  title: { ...font.head, color: c.text, marginBottom: space.md },
  input: {
    borderWidth: 1.5, borderColor: c.fieldBorder, backgroundColor: c.field,
    borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48,
    ...font.body, color: c.text,
  },
  hint: { ...font.tiny, color: c.textMuted, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  btn: {
    minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center',
  },
  btnText: { ...font.sub, color: c.textSub },
  btnPrimary: { backgroundColor: c.accent },
  btnPrimaryText: { ...font.sub, fontWeight: '500', color: c.onAccent },
  btnDanger: { paddingHorizontal: space.sm },
  btnDangerText: { ...font.sub, color: c.danger },
});