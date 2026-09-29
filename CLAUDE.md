@AGENTS.md

# 스마트라이더 — CLAUDE.md

배달 라이더용 건물 출입정보 앱. 건물 근처에서 내 메모 토스트, 후면 단속카메라 구역 경고.
Expo SDK 54 / RN 0.81.5 / 새 아키텍처(`newArchEnabled=true`) / bare workflow(`android/` 직접 관리).
패키지 `com.richcompany.smartridernative3`. 기준 문서: `docs/` 3판 + 3-7판.

대표님은 초보 개발자, 윈도우. **대화는 반말로, "오실장"**으로 한다.

## 0. 작업 방식
- **작업이 끝나면 `docs/`의 최신 개발문서에 오늘 한 일을 추가**한다.
- **`git push`, `adb install`은 실행 전에 매번 물어본다.**
- **Firebase 콘솔·Play Console 작업은 대표님이 직접** 한다. 필요하면 순서만 알려준다.
- **`docs/`에는 3판 + 최신판 두 개만 둔다.** 새 판을 만들면 이전 판은 지우고 커밋 (git 기록에 남음).
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
| `App.js` | 네비게이션, `initAds()`, 로그인 후 `ProximityNotifier`·`UpdateGate` |
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

## 4. 지금 상태와 남은 일 (09-28 기준)

- 스토어: v3(1.0.1) 게시 / **v4(1.0.2) 09-26 제출, 검토 중** / 비공개 테스트 12명, **10-04 이후 프로덕션 신청 가능**
- 코드: versionCode **4**, `USE_TEST_ADS = true`
- **v5(1.0.3)** 작업 완료·커밋, **미제출**: 공용 메모1 차단 / 강력알림 15km / 알림 클러스터 / 중요 핀 / 캐시 10분 / 홈 탭 슬라이드
- ✅ 목록 복사 버튼(복사해서 새로 등록) — `HomeScreen.js`, 테스트 완료. v5에 포함

### ⚠️ v5 내는 순서 (꼭 지킬 것)
1. **v4 게시 확인** 먼저 (검토 중에 올리면 v4 검토 취소)
2. versionCode 5 / versionName 1.0.3 / `APP_VERSION_CODE = 5` → `USE_TEST_ADS=false` → `bundleRelease` → 보관 → **바로 true** → 커밋
3. 제출 → 게시 → 메인폰 v5 업데이트
4. 공용 건물 비번 노출분(2~3개) 정리: 개인 메모로 옮김 → 콘솔에서 memo 삭제 → `meta/buildingsVersion` +1
5. Firebase 규칙 `buildings/$id`에 `"memo": { ".validate": "newData.val() == ''" }`
6. 최소 버전 스위치 ON (`meta/minVersionCode = 5`, 숫자형)
7. **그다음에야** 경기청 단속카메라 자료 입력 (v4 폰에 수천 개 통째 전달 방지)

### 그 뒤
- 공유 버튼 처리 결정 (대표님 고민 중) / 이용약관 페이지 / 피쉬라인 애드몹
- 정식 출시 후: 어드민 웹(현황판), 코틀린 묶음(무료 일반 알림 + 엘베 GPS 오차 필터 + 강력알림 7km 이탈 시 자동 갱신), 유료화
