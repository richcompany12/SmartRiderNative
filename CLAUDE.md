@AGENTS.md

# 스마트라이더 — CLAUDE.md

배달 라이더용 건물 출입정보 앱. 건물 근처에서 내 메모 토스트, 후면 단속카메라 구역 경고.
Expo SDK 54 / RN 0.81.5 / 새 아키텍처(`newArchEnabled=true`) / bare workflow(`android/` 직접 관리).
패키지 `com.richcompany.smartridernative3`. 기준 문서: `docs/` 3판 + 3-7판.

대표님은 초보 개발자, 윈도우. **대화는 반말로, "오실장"**으로 한다.

## 0. 작업 방식
- **작업이 끝나면 `docs/`의 최신 개발문서에 오늘 한 일을 추가**한다.
- **`docs/기획요약.md`도 같이 갱신**한다 (채팅 오실장=기획 담당용, 2페이지 이내, **코드 얘기 없이**: 지금 상태 / v6 목록 / 정해진 원칙 / 남은 일·보류). 맨 위 기준 날짜도 바꾼다.
- **`git push`, `adb install`은 실행 전에 매번 물어본다.**
- **수정 스크립트가 하나라도 실패하면 그 자리에서 멈추고 커밋하지 않는다.** 수정과 커밋은 `set -e`로 묶거나 단계를 나눈다. 커밋 전 `git status`·`git diff --stat`으로 바뀐 파일을 확인한다. `git add`는 `git add -u` 또는 실제 경로 대소문자 그대로 (코틀린 폴더는 `com/richcompany/SmartRiderNative3/`, 10-08 커밋 누락 사례)
- **Firebase 콘솔·Play Console 작업은 대표님이 직접** 한다. 필요하면 순서만 알려준다.
- **`docs/`에는 3판 + 최신판 + `기획요약.md` 세 개만 둔다.** 새 판을 만들면 이전 판은 지우고 커밋 (git 기록에 남음).
- **명령어 실행 설명은 한국어로 쉽게 한 줄, 맨 앞에 표시.** 예: `[보기만] 바뀐 파일 목록 확인`
  - `[보기만]` 파일이나 폰을 바꾸지 않는 명령 (status, diff, log, `logcat -d` 등)
  - `[변경]` 파일을 바꾸거나 커밋하는 명령
  - `[위험]` 설치, 삭제, push, 배포

---

## 1. 절대 규칙

1. **`adb install`은 공기계에만.** 메인폰 설치 절대 금지. 설치 전 `adb devices`로 **한 대만** 보이는지 확인.
   (서명 달라서 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 떠도 "지우고 재설치" 금지)
2. **메인폰 앱 데이터 삭제 금지.** `adb uninstall`, 저장공간 지우기, 캐시 삭제 전부 금지 (건물 1,000여 건 날아감).
3. **`USE_TEST_ADS`(adConfig.js)는 스토어 AAB 빌드 때만 `false`, 빌드 끝나면 바로 `true`.** 공기계용 APK는 항상 `true`.
4. **공용 건물의 `memo`(메모1)는 절대 서버에 올리지 않는다.** 서버엔 빈칸, 내용은 내 폰 개인 메모로. 메모2·이름·샛길·특이사항만 공용.
5. **건물 전달은 `syncBuildingsToService` 하나, 강력알림 전달은 `syncAlertsToService` 하나.** 복사본 금지 (복사본엔 important·click·15km가 빠진다).
6. **코드를 고치기 전에 뭘 바꿀지 먼저 설명하고 대표님 승인을 받는다.**
7. **서비스의 `startForeground`는 `enterForeground()` 하나로만.** `onStartCommand`의 `enterForeground()` 호출은 지우지 말 것 (지우면 설치·업데이트 직후 30초 크래시 재발).
8. **테스트할 땐 "설치 직후 바로 열고 40초 대기"도 꼭 확인.**

### 그 밖에 하지 말 것
- `npx expo prebuild` (android 폴더·코틀린 날아감)
- `newArchEnabled=false`로 되돌리기 / 광고 패키지 17.x 올리기 (`react-native-google-mobile-ads@16.3.4` 고정)
- 서비스→JS 이벤트에 `reactInstanceManager` 사용 (반드시 `reactHost`)
- `ProximityOverlayModule.kt`에 서비스 시작 메서드 추가 시 `hasLocationPermission()` 빠뜨리기 (FGS 크래시)
- 권한 `request`는 `PermissionScreen.js`에서만
- 본체와 곁다리를 `Promise.all`로 묶기 (try를 따로, 오류엔 `e.message`)
- `android:allowBackup="true"`, 패키지명 변경, keystore 분실
- 본인 폰에서 진짜 광고 클릭 / 가짜 GPS는 공기계에서만
- 심사 계정 `review.smartrider@gmail.com` 삭제

### 코드 작성 주의
- `app.json`은 빌드에 안 쓰인다 (예외: 광고 앱 ID). 진짜 설정은 `android/` 안.
- JSX 텍스트에 `> < { }`·특수문자 넣지 않기. JSX 안에 `// 주석` 금지. JSON에 주석 금지.
- `MapScreen.js`의 백틱 HTML은 문법 검사가 안 된다 → 괄호 짝 직접 확인.
- 훅은 로딩 `return` 위에 둔다 (DetailScreen 훅 순서 오류 사례).
- "없다"고 적힌 기능도 만들기 전에 파일 검색부터.

---

## 2. 명령어 (cmd 기준, **한 줄씩** 실행)

```
:: 공기계용 APK 빌드·설치
cd /d D:\app\SmartRiderNative3\android
gradlew.bat assembleRelease -x lint -x lintVitalAnalyzeRelease
adb devices
adb install -r D:\app\SmartRiderNative3\android\app\build\outputs\apk\release\app-release.apk

:: res/ 변경, 네이티브 패키지 추가, gradle.properties 변경 시 먼저
gradlew.bat clean
:: 빌드가 잠김 등으로 실패하면
gradlew.bat --stop

:: 스토어 AAB
gradlew.bat bundleRelease
:: 결과: android\app\build\outputs\bundle\release\app-release.aab
::   → D:\app\배포보관\smartrider_v5_날짜.aab 로 복사

:: 로그
adb logcat -c
adb logcat ReactNativeJS:V PROX_KT:D AndroidRuntime:E *:S
adb logcat -d AndroidRuntime:E ReactNativeJS:E PROX_KT:D *:S > D:\crash.txt

:: app.json 검사
node -e "require('./app.json'); console.log('OK')"

:: 커밋
cd /d D:\app\SmartRiderNative3
git status
git add -A
git commit -m "작업 내용"
git push
```

- `BUILD SUCCESSFUL` 확인 후 다음 줄. (실패해도 `install -r`은 옛 APK를 깐다)
- PowerShell 문법과 cmd 문법 섞지 않기. `findstr`에 한글 검색어 넣지 않기.

### 스토어 제출 순서
1. `android/app/build.gradle` versionCode·versionName 올림 + `UpdateGate.js` `APP_VERSION_CODE` 같은 숫자
2. `adConfig.js` `USE_TEST_ADS = false`
3. `gradlew.bat bundleRelease` → `D:\app\배포보관\`에 복사
4. **바로 `USE_TEST_ADS = true`** → 커밋
5. Play Console 업로드 (R8 경고는 무시)

---

## 3. 파일 구조

### 루트
| 파일 | 역할 |
|---|---|
| `App.js` | 네비게이션, `initAds()`, 로그인 후 `ProximityNotifier`·`UpdateGate`·`TermsGate` |
| `AuthContext.js` / `roles.js` | 로그인 상태·역할 (폰 저장 역할로 먼저 시작) |
| `firebase.js` / `firebaseDB.js` | Firebase 초기화 / 공용 건물·알림 CRUD + **버전 캐시**(`meta/*Version`, `bumpVersion`) |
| `personalDB.js` | 개인 건물·메모·즐겨찾기 (폰, uid 안 씀) |
| `buildingsCache.js` | 공용+개인 합치기, 메모리 캐시 **10분**, `Promise.allSettled` |
| `alertSync.js` | 강력알림 → 코틀린 전달 (**주변 15km**, `syncAlertsToService`) |
| `migration.js` | 서버↔폰 이전, 공용 승격(`promoteToPublic`, 메모1 제외) |
| `backup.js` | AES 암호화 백업/복원 |
| `accountDelete.js` | 회원 탈퇴 (계정 삭제는 맨 마지막) |
| `adConfig.js` / `adManager.js` | `USE_TEST_ADS` 스위치 / 광고 초기화·빈도·플로팅 숨김 |
| `UpdateGate.js` | 최소 버전 강제 업데이트 창 (`APP_VERSION_CODE`) |
| `TermsGate.js` | 약관 동의 창 (v6). `meta/termsVersion`(숫자)보다 폰의 `terms_agreed_version`이 작으면 띄움. `TERMS_URL`·`PRIVACY_URL`, 제보에 붙는 `getAgreedTermsVersion()` |
| `settingsCache.js` | 설정값 (반경, 플로팅, 토스트음 등) |
| `theme.js` | 색·글자·간격, 다크모드 (`c.accent` = 브랜드색) |
| `imageUpload.js` / `suggestionsDB.js` / `copyUtil.js` / `navigationRef.js` | 사진 / 제보 / 복사 / 화면 이동 |

### screens/
| 파일 | 역할 |
|---|---|
| `HomeScreen.js` | 칩 탭(강력알림 일반 15km·어드민 전체), 정렬, 탭 슬라이드, 목록 복사→새 등록 |
| `RegisterScreen.js` / `DetailScreen.js` | 등록 / 상세·수정·사진·중요 표시. 공용 저장 시 메모1 빈칸 처리 |
| `MapScreen.js` | 카카오맵 WebView, 건물 20km, 알림 전국+클러스터, 중요 핀 |
| `ProximityNotifier.js` | 서비스 연동, `syncBuildingsToService`, 권한은 **확인만** |
| `PermissionScreen.js` | 권한 3종 **요청 전담** |
| `SettingsScreen.js` / `Sidebar.js` | 설정 / 메뉴·백업·공유·설명서·탈퇴 |
| 기타 | `Search`, `Login`, `DeleteAccount`, `Suggest(Admin)`, `LocationPicker`, `AlertDetail`, `BuildingRow`, `AlertRow`, `ShortcutBar` |

### Kotlin (`android/app/src/main/java/com/richcompany/SmartRiderNative3/`)
- `ProximityOverlayService.kt` (~1,500줄) — 위치 판정·토스트·강력경고·플로팅, JS 이벤트는 `reactHost`
- `ProximityOverlayModule.kt` — JS↔네이티브 다리, 권한 관문 `hasLocationPermission()`
- `MainApplication.kt` — 손대지 않음
- `res/raw/smartrider4.wav`(강력알림, 알람 볼륨) / `toast_click.wav`(토스트, 알림 볼륨)

---

## 4. 지금 상태와 남은 일 (10-02 기준)

- 스토어: **v5(1.0.3) 승인·게시 완료**, 메인폰도 v5로 업데이트함 / 비공개 테스트 12명, 프로덕션 신청 가능일 **10-04~10-05 (Play Console에서 재확인)**
- 코드: versionCode **5** (1.0.3), `APP_VERSION_CODE = 5`, `USE_TEST_ADS = true`
- v5 AAB: `D:\app\배포보관\smartrider_v5_20260929.aab`
- v5 내용: 공용 메모1 차단 / 강력알림 15km / 알림 클러스터 / 중요 핀 / 캐시 10분 / 홈 탭 슬라이드 / 목록 복사 버튼(복사해서 새로 등록)
- **서버 `buildings` = 전부 공용** (개인 건물은 폰에만). `promotedAt` 있는 것 = 공용 올리기(`promoteToPublic`)로 올린 것(`-P...` id), 숫자 id = 등록 화면 공용 저장(`Date.now()`)
- 강력알림(alerts) **751개** 입력됨 (10-02): 서울청 157 + 경기남부청 436 + 경기북부청 121 + 직접 등록 37. 작업 폴더 `D:\app\단속카메라`

### v5 게시 후 남은 일
1. ✅ 공용 건물 메모1 노출 정리 — 10-02 끝남 (서버 `buildings` memo 내용 있는 것 0개 확인)
2. ⬜ Firebase 규칙 `buildings/$id`에 `memo`·`password`·`publicMemo` = 빈칸이거나 없을 때만 (대표님이 콘솔에서). 초안 `D:pp±005스마트라이더 리얼타임규칙_초안.txt`. 10-05 서버의 옛 `password` 5개·`publicMemo` 1개 삭제 완료 (백업 `D:pp\단속카메라\백업uildings_전체백업_20261005_160518.json` — 비번 들어 있음, 공유 금지)
3. ✅ 최소 버전 스위치 ON — `meta/minVersionCode = 5` (숫자, 10-06). 공기계(v4)에서 업데이트 창·스토어 이동 확인, 메인폰(v5) 통과 확인
   - 공기계는 adb로 깐 개발용 APK(서명 다름)라 스토어 업데이트가 "설치할 수 없음" → 정상. **지우고 재설치 금지**, v6 공기계 테스트 때 새 APK(versionCode 6)를 adb로 덮어 깔기
4. 경기청 단속카메라 자료는 이미 입력함 (위 751개). 원래 "v5 게시 뒤에 입력"으로 정한 이유는 **v4 폰이 수천 개를 통째로 받는 것**을 막으려던 것.
   751개는 코틀린 전달 한도 1MB의 10분의 1도 안 돼서 v4 폰이 받아도 괜찮음. **앞으로 청 자료가 늘어 수천 개 가까이 되면** 최소 버전 스위치(3번)를 먼저 켜고 넣을 것.

### v6 목록 (10-08 확정, 번호는 `docs/기획요약.md` 2장과 같음)
- **2단계(5번) 코드 완료 (10-08):** `RegisterScreen` `confirmNoSimilar` — 50m 안 + 비슷한 이름(같거나 숫자 아닌 3글자 겹침, "오피스텔·아파트" 같은 흔한 말 제외)이면 경고 창 [다시 확인]/[그래도 저장]. 폰에 받아둔 목록만 비교(서버 조회 없음). 고치는 중이면 자기 자신, 목록 복사로 열렸으면 원본(`copiedFromId`, Home·Search 복사 버튼)은 뺌. 알려진 점: 동네 이름이 같은 다른 건물("동탄능동 블리스인"·"동탄능동 헤리움")도 50m 안이면 뜸 → 테스트에서 자주 뜨면 다듬기
- **1단계 코드 완료 (10-08, 빌드 전):** 6·1·4·3·2·8·9·10. 빌드·공기계 테스트는 2단계(5) 끝나고 묶어서. 테스트 항목: 저장·올리기 빠른 두 번 탭 / 공용 저장 → 상세 초록 안내 띠 / 중요 버튼 이름 아래·주황 / 새 등록 시 중요 꺼짐 / 위치 선택 화면 버튼 다 보임·초록 / 알림바 문구 3종 / "후면·양방향 카메라" 이름 (등록·상세·목록·지도·설정·경고 토스트) / 설치 직후 40초
- **진행 (10-08 결정):** 1단계(6→1·4→3→2→8→9→10) + 2단계(5) 먼저 → 그 뒤 v6 출시 여부 결정. 대표님 생각은 **3단계(14·15+E)까지 v6에** 넣기
**A. 등록 안정화** (10-02 조사: 공용 건물 같은 이름 중복 + 삼성시티 important가 저절로 켜진 일. 조사 결과는 아래 근거)
1. ✅(코드 10-08) **저장·공용 올리기 버튼은 누르는 순간 잠금** (확인 창 뜨기 전에). 지금은 `RegisterScreen.handleSave`에서 `setIsSaving(true)`가 `await confirmPublicMemo()` 뒤에 있고, `DetailScreen.handlePromote`는 확인 창 "올리기" 안에서 `setSaving(true)`라서 빠른 두 번 탭이 둘 다 통과함 → 숫자 id(`Date.now()`) 공용 건물이 2개 생김. state 말고 `useRef` 잠금으로.
2. ✅(코드 10-08) **공용 저장 후 상세 수정으로 넘어갈 때 "저장됐어요, 사진을 추가하세요" 안내.** 지금은 `navigation.replace('Detail', { startEdit: true })`로 바로 수정 화면이 떠서, 등록 안 된 줄 알고 다시 등록하게 됨.
3. ✅(코드 10-08) **중요 버튼을 사진 버튼(찍기·앨범에서)에서 떼고, 켜지면 주황색으로 확실히 보이게.** `DetailScreen` 수정 모드에서 사진 버튼 바로 아래 12px 간격이라 같이 눌림. 등록 화면에선 즐겨찾기 버튼 바로 아래 같은 모양이라 같이 눌림.
4. ✅(코드 10-08) **등록 화면 재사용 시 important 초기화.** `RegisterScreen`의 `route.params.buildingData` useEffect가 이름·메모 등은 다시 채우는데 `important`는 빠져 있음.
5. ✅(코드 10-08) **등록 시 50m 안에 비슷한 이름이 있으면 경고.** 지금은 중복 확인이 전혀 없어서, 이미 공용에 있는 건물(예: 동탄 센트럴에스타운)을 새로 등록하거나 복사 버튼으로 공용 저장해도 그대로 하나 더 생김.
6. ✅(코드 10-08) **공용 올리기·어드민 상세 저장에서 `password`, `publicMemo`, `hasPersonalNote` 빼고 올리기** (10-05). `promoteToPublic`의 `...rest`가 옛 데이터의 `password` 칸을 그대로 올렸고, `DetailScreen` 어드민 저장은 서버에서 읽은 `password`를 다시 씀. 규칙에서 `password`·`publicMemo`를 막으면 이걸 고치기 전엔 옛 데이터 올릴 때 "올리기 실패"

**B. 약관**
7. ✅ 코드 완료 (`cbf8051`, 10-05) — 빌드 후 공기계 확인
   - 사이드바·로그인 화면 이용약관 링크 `https://richcanopy.kr/smartrider/terms/` / 앱 실행 시 동의 1회 / 동의는 **폰에만** (`terms_agreed_version`) / 제보에 `termsVersion` / 약관 바뀌면 콘솔 `meta/termsVersion`만 올림 / 업데이트 필요한 폰은 업데이트 창 우선
   - 테스트: 처음 실행 시 창 / 동의 후 다시 안 뜸 / 비행기모드 기본값 1 / 콘솔 2로 올리면 다시 뜸 / 링크 / 제보에 termsVersion

**C. 화면 수정**
8. ✅(코드 10-08) 지도 위치저장 버튼 (`MapScreen.js`): 하단바에 가려 반만 보임 → 하단 여백(safe area) 반영 / 혼자 파란색 → 앱 색에 맞추기
9. ✅(코드 10-08) 상단 알림바 문구 (`ProximityOverlayService.kt` `updateNotification`): **A안 확정 (10-08)** — 정상 "건물 메모 알림 켜짐 · 내 건물 N곳" / 위치 끊김 "위치를 잠시 못 받고 있어요 · GPS를 확인해주세요" / 시작 직후 "알림 준비 중...". 초 표시 삭제, 상태가 바뀔 때만 알림 갱신
10. ✅(코드 10-08) 단속카메라 화면 이름 "후면·양방향 카메라"로 통일. 데이터 구분(`alerts.rearType` = 후면/양방향)은 그대로

**D. 새 기능**
11. ⬜ 볼륨 4단계 (강력알림·토스트 따로, 지금 2단계)
12. ⬜ 블루투스 연결 시 헬멧으로만 소리 (내비 안내음 방식), 인터콤 앞부분 잘림 대비
13. ⬜ 단지 영역 메모(마스터 비번): 지도에 점 찍어 영역 그리기 / 등록 + 버튼·지도 롱프레스 / 수정 지도 영역 탭·건물 상세 카드·검색 / **폰에만 저장**
14. ⬜ 활동 지역 선택: 업데이트 후 첫 실행 안내 "내 지역 카메라·건물 정보를 받으려면 활동 지역을 골라주세요" / 시·도 → 시·군·구, 최대 3곳 / 사이드바·설정에서 변경 / **"현재 위치로 자동 선택" 절대 금지**
15. ⬜ 라이더 통계: `users/{uid}/stats` = 활동 지역 + 등록 건물 개수 + 마지막 접속일 + 앱 버전**만**. 건물 이름·메모·위치 절대 금지. 바뀔 때만 올림. **접속일은 하루 1번, 날짜만(시각 없이)** (10-08)
16. ⬜ 라이더 편의 정보 토스트 (화장실·생수·쉼터 등 **무료 정보만**): 설정에서 켜야 동작(기본 꺼짐) / 멈췄을 때 일반 토스트 방식 / 부드러운 알림음 / 같은 지점 10분 안 중복 금지 / **돈 받는 제휴상점 절대 금지**
17. ⬜ 상점 광고는 **앱 안에서만** (지도 스폰서 핀, 건물 상세 "근처 라이더 혜택" 카드). **토스트·플로팅(오버레이)엔 광고·유도 문구 절대 금지** (구글 정책)

**E. 출시 전 같이 할 것 (코드 밖)**
- 개인정보처리방침 1조에 "활동 지역", "등록 건물 개수(내용·위치 제외)" + 목적 "지역별 정보 제공, 서비스 통계, 서비스·제휴 안내 연락" (리치캐노피 사이트)
- Play Console 데이터 보안 양식 수정
- Firebase 규칙 `users/{uid}/stats` 본인만 쓰기

**위치정보 원칙 (10-08, 기획요약 3장)**
- 라이더 좌표·경로는 **서버로 절대 안 보냄.** 비교는 전부 폰 안에서. 근거: 위치정보지원센터 답변(10-08) — 서버로 보내는 순간 위치기반서비스사업 신고 재검토
- 데이터 내려받기는 **전체 또는 라이더가 고른 지역 단위.** 내 좌표로 서버 조회(geo 쿼리) 금지
- 상점 광고 성과는 상점별 숫자만 (노출 위치 전송 금지) / 특별판 주소 비교도 폰 안에서만

**낮은 우선순위 (메모만)**
- `promoteToPublic`(migration.js) 순서: 서버 공용 저장 → 폰에 비번 저장 → 개인 사본 삭제. 공용 저장 뒤 폰 저장소 오류가 나면 개인 사본이 남아 목록에 두 번 나오고, 그걸 다시 올리면 공용이 2개 됨.

### 그 뒤
- 공유 버튼 처리 결정 (대표님 고민 중) / 이용약관 페이지 / 피쉬라인 애드몹
- 정식 출시 후: 어드민 웹(현황판), 코틀린 묶음(무료 일반 알림 + 엘베 GPS 오차 필터 + 강력알림 7km 이탈 시 자동 갱신), 유료화
