import { useEffect, useRef, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useTheme } from '../theme';
import * as Location from 'expo-location';
import { getAllAlertPoints } from '../firebaseDB';
import { getCachedBuildings } from '../buildingsCache';

const KAKAO_API_KEY = '7d65ade73c1b3e7d64687306911f7ce7';

// 지도에 그릴 범위. 건물이 2000건을 넘으면 핀을 전부 그릴 때 지도가 버벅인다.
// 라이더가 실제로 쓰는 건 주변뿐이므로 이 반경만 그린다.
const MAP_RADIUS_KM = 20;

// 두 좌표 사이 거리(km)
const distanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export default function MapScreen({ navigation }) {
  const webViewRef = useRef(null);
  const [buildings, setBuildings] = useState([]);
  const [alertPoints, setAlertPoints] = useState([]);
  const [myLocation, setMyLocation] = useState(null);
  const [shown, setShown] = useState({ mine: 0, pub: 0, total: 0 });

  // 팝업이 이미 떠 있으면 두 번째 요청을 무시하기 위한 잠금장치
  const alertOpenRef = useRef(false);

  const refreshMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
    const newLoc = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    setMyLocation(newLoc);
    webViewRef.current?.postMessage(JSON.stringify({ type: 'UPDATE_MY_LOCATION', myLocation: newLoc }));
  };

  const loadData = async () => {
    const bList = await getCachedBuildings();
    const aList = await getAllAlertPoints();
    setBuildings(bList);
    setAlertPoints(aList);
  };

  useEffect(() => {
    (async () => {
      await refreshMyLocation();
      await loadData();
    })();
  }, []);

  // 지도 탭에 다시 들어올 때마다 현재위치 + 목록 갱신
  // (등록 화면에서 캐시를 무효화했으면 여기서 새 건물이 바로 반영된다)
  useFocusEffect(
    useCallback(() => {
      refreshMyLocation();
      loadData();
    }, [])
  );

  // 데이터 준비되면 WebView로 전송
  useEffect(() => {
    if (!myLocation) return;
    sendToMap();
  }, [myLocation, buildings, alertPoints]);

  const sendToMap = () => {
    const near = buildings.filter(b => {
      if (!b.location) return false;
      const lat = parseFloat(b.location.lat);
      const lng = parseFloat(b.location.lng);
      if (isNaN(lat) || isNaN(lng)) return false;
      return distanceKm(myLocation.lat, myLocation.lng, lat, lng) <= MAP_RADIUS_KM;
    });

    // 배지에 쓸 숫자
    setShown({
      mine: near.filter(b => b.scope === 'personal').length,
      pub: near.filter(b => b.scope !== 'personal').length,
      total: buildings.length,
    });

    const msg = JSON.stringify({
      type: 'INIT',
      myLocation,
      buildings: near,
      alertPoints: alertPoints.filter(a => a.location),
    });
    webViewRef.current?.postMessage(msg);
  };

  const moveToMyLocation = async () => {
    await refreshMyLocation();
  };

  // 팝업을 닫은 뒤 시간차를 두고 이동한다.
  // 팝업이 떠 있는 상태에서 navigate를 부르면 에러 없이 조용히 무시되는 경우가 있다.
  const goRegister = (params) => {
    alertOpenRef.current = false;
    setTimeout(() => navigation.navigate('Register', params), 250);
  };

  // WebView → RN 메시지 처리
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'JS_ERROR') { alert('지도 에러: ' + data.msg); return; }

      if (data.type === 'MARKER_CLICK') {
        // 알림지점과 건물은 저장 위치가 달라서 화면도 따로 간다
        if (data.kind === 'alert') {
          navigation.navigate('AlertDetail', { alertId: data.id });
        } else {
          navigation.navigate('Detail', { buildingId: data.id });
        }
        return;
      }

      if (data.type === 'LONG_PRESS') {
        // 이미 팝업이 떠 있으면 무시 (창이 겹쳐 뜨는 것을 막는다)
        if (alertOpenRef.current) return;
        alertOpenRef.current = true;

        const { lat, lng, nearest } = data;

        if (nearest) {
          Alert.alert(
            '근처 건물 발견',
            `📍 근처에 "${nearest.name}" 이(가) 있습니다.\n\n복사해서 등록하시겠습니까?`,
            [
              {
                text: '복사 등록',
                onPress: () => goRegister({
                  buildingData: {
                    name: nearest.name,
                    memo: nearest.memo || '',
                    memo2: nearest.memo2 || '',
                    note: nearest.note || '',
                    shortcut: nearest.shortcut || '',
                    images: []
                  },
                  location: { lat, lng }
                })
              },
              {
                text: '새로 등록',
                onPress: () => goRegister({ location: { lat, lng } })
              },
              {
                text: '취소',
                style: 'cancel',
                // 취소는 잠금만 풀고 아무 일도 하지 않는다
                onPress: () => { alertOpenRef.current = false; }
              }
            ],
            {
              cancelable: true,
              // 바깥을 눌러 닫았을 때도 잠금 해제
              onDismiss: () => { alertOpenRef.current = false; }
            }
          );
        } else {
          goRegister({ location: { lat, lng } });
        }
      }
    } catch (e) {}
  };

  const mapHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    * {
      margin: 0; padding: 0; box-sizing: border-box;
      /* 길게 눌러도 글자가 선택되거나 복사 메뉴가 뜨지 않게 */
      -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
    }
    body { width: 100vw; height: 100vh; overflow: hidden; }
    #map { width: 100%; height: 100%; }

    /* ── 메모창 바깥 껍데기 ───────────────────────────
       너비는 여기서 딱 한 번만 정한다. 안쪽은 전부 100%로 따라간다.
       아래쪽 투명 여백 50px = 핀 높이보다 살짝 크게 잡은 것.
       yAnchor:1 이 이 껍데기의 '맨 아래'를 핀 끝에 맞추므로
       실제 상자는 핀 바로 위에 딱 붙어서 뜬다. */
    .ov-wrap { width: 250px; padding-bottom: 50px; position: relative; }

    /* 어느 핀에서 나온 창인지 보여주는 꼬리 */
    .ov-tail {
      position: absolute; left: 50%; margin-left: -8px; bottom: 42px;
      width: 0; height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 9px solid #fff;
    }

    .overlay {
      width: 100%;
      background: #fff; border-radius: 10px;
      /* 오른쪽 여백을 넉넉히 둬서 닫기 버튼과 글자가 겹치지 않게 한다 */
      padding: 11px 38px 11px 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      font-family: sans-serif; position: relative;
      border-left: 4px solid #185FA5;
      box-sizing: border-box;
      overflow: hidden;
    }

    /* ★ 글자가 상자 밖으로 빠져나가던 진짜 원인.
       바깥에서 물려받은 nowrap 때문에 줄바꿈 자체가 막혀 있었다.
       nowrap 상태에서는 overflow-wrap 을 아무리 줘도 안 먹는다.
       여기서 강제로 풀어준다. */
    .overlay, .overlay * { white-space: normal; }

    .overlay-head { width: 100%; }
    /* flex를 쓰지 않는다. flex 항목은 내용보다 작아지길 거부해서
       긴 이름이 상자를 밀어내고 잘려 보였다. 그냥 블록이면 알아서 줄바꿈된다. */
    .overlay-name {
      font-weight: bold; font-size: 14px; color: #1A1A18;
      overflow-wrap: anywhere; word-break: break-word; line-height: 1.35;
    }
    .overlay-memo {
      margin-top: 6px; font-size: 15px; color: #1A1A18; background: #F3F2ED;
      padding: 6px 8px; border-radius: 6px; font-family: monospace;
      overflow-wrap: anywhere; word-break: break-word;
    }
    .overlay-mine { border-left-color: #075B4B; }
    .overlay-scope { font-size: 10px; font-weight: bold; margin-bottom: 3px; }
    .overlay-scope-mine { color: #075B4B; }
    .overlay-scope-public { color: #185FA5; }
    .overlay-memo2 { margin-top: 4px; background: #FEF6E7; color: #B45309; }
    .overlay-alert { border-left-color: #dc2626; }
    .overlay-type { font-size: 12px; font-weight: bold; color: #b91c1c; margin-bottom: 4px; }
    .overlay-hint { font-size: 10px; color: #9ca3af; margin-top: 6px; text-align: center; }
    .overlay-close {
      position: absolute; top: 4px; right: 4px;
      width: 30px; height: 30px; line-height: 30px; text-align: center;
      cursor: pointer; font-size: 19px; color: #9ca3af;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false"></script>
  <script>
    window.onerror = function(msg, src, line) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'JS_ERROR', msg: msg + ' @' + line }));
      return true;
    };
    if (typeof kakao === 'undefined') {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type:'JS_ERROR', msg: 'kakao SDK 로드 실패 (네트워크/도메인)' }));
    }

    var map, myMarker, currentOverlay;

    // ★ INIT이 여러 번 와도 리스너가 쌓이지 않도록 데이터는 전역에 보관한다
    var mapBuildings = [];
    var placedMarkers = [];   // 다시 그릴 때 지우기 위해 보관

    // ── 핀 색 구분 ──────────────────────────────────
    //  청록 = 내 폰에만 있는 건물 / 파랑 = 공용 건물
    //  이미지 파일 없이 SVG를 그려서 쓴다. 인터넷이 없어도 뜬다.
    function makePin(color) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 26 36">'
        + '<path d="M13 0C5.8 0 0 5.8 0 13c0 9.8 13 23 13 23s13-13.2 13-23C26 5.8 20.2 0 13 0z" fill="' + color + '"/>'
        + '<circle cx="13" cy="13" r="5" fill="#ffffff"/>'
        + '</svg>';
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    var PIN_MINE = null, PIN_PUBLIC = null, PIN_SELECTED = null;
    var ALERT_IMG = null, ALERT_IMG_SELECTED = null;
    var ALERT_ICON_URL = 'https://cdn-icons-png.flaticon.com/512/564/564619.png';

    // 마커 이미지는 처음 한 번만 만들어두고 계속 재사용한다
    function ensureImages() {
      if (PIN_MINE) return;
      PIN_MINE     = new kakao.maps.MarkerImage(makePin('#075B4B'), new kakao.maps.Size(26, 36));
      PIN_PUBLIC   = new kakao.maps.MarkerImage(makePin('#185FA5'), new kakao.maps.Size(26, 36));
      // 선택된 핀: 빨강 + 살짝 크게. 핀 끝(뾰족한 부분)이 그대로 그 자리에 있는다
      PIN_SELECTED = new kakao.maps.MarkerImage(makePin('#D92B2B'), new kakao.maps.Size(30, 42));
      ALERT_IMG          = new kakao.maps.MarkerImage(ALERT_ICON_URL, new kakao.maps.Size(35, 35));
      ALERT_IMG_SELECTED = new kakao.maps.MarkerImage(ALERT_ICON_URL, new kakao.maps.Size(46, 46));
    }

    function pinImage(isMine) {
      ensureImages();
      return isMine ? PIN_MINE : PIN_PUBLIC;
    }

    // ── 선택된 핀 표시 ──────────────────────────────
    //  지금 열려 있는 메모창이 어느 핀 것인지 한눈에 보이게 한다
    var selMarker = null, selOriginalImg = null;

    function selectPin(marker, originalImg, selectedImg) {
      clearPinSelection();
      selMarker = marker;
      selOriginalImg = originalImg;
      marker.setImage(selectedImg);
      marker.setZIndex(20);   // 다른 핀에 가리지 않게 위로 올린다
    }

    function clearPinSelection() {
      if (selMarker && selOriginalImg) {
        selMarker.setImage(selOriginalImg);
        selMarker.setZIndex(1);
      }
      selMarker = null;
      selOriginalImg = null;
    }

    // 건물 이름에 <, & 같은 글자가 있어도 화면이 깨지지 않게
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function isMineItem(b) {
      if (b.scope) return b.scope === 'personal';
      return String(b.id || '').indexOf('local_') === 0;
    }

    kakao.maps.load(function() {
      map = new kakao.maps.Map(document.getElementById('map'), {
        center: new kakao.maps.LatLng(37.5665, 126.9780),
        level: 3
      });

      // ★ 롱프레스 리스너는 여기서 딱 한 번만 등록한다.
      //    initMap 안에 두면 INIT이 올 때마다 리스너가 쌓여서
      //    한 번 눌렀는데 팝업이 여러 장 뜬다. (이번 버그의 원인)
      setupLongPress();

      // 빈 지도를 톡 치면 메모창이 닫히고 핀 색도 돌아온다.
      // 혹시 이 줄 때문에 창이 제멋대로 닫히면 이 한 줄만 지우면 된다.
      kakao.maps.event.addListener(map, 'click', function() { closeOverlay(); });

      document.addEventListener('message', handleRNMessage);
      window.addEventListener('message', handleRNMessage);
    });

    function handleRNMessage(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'INIT') {
          initMap(data);
        } else if (data.type === 'MOVE_TO_MY_LOCATION') {
          if (myMarker) map.setCenter(myMarker.getPosition());
        } else if (data.type === 'UPDATE_MY_LOCATION') {
          var newPos = new kakao.maps.LatLng(data.myLocation.lat, data.myLocation.lng);
          if (myMarker) myMarker.setPosition(newPos);
          map.setCenter(newPos);
        }
      } catch(err) {}
    }

    function calcDistance(lat1, lng1, lat2, lng2) {
      var R = 6371000;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLng = (lng2 - lng1) * Math.PI / 180;
      var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
              Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
              Math.sin(dLng/2)*Math.sin(dLng/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function findNearest(lat, lng) {
      var nearest = null, minDist = Infinity;
      mapBuildings.forEach(function(b) {
        if (!b.location) return;
        var d = calcDistance(lat, lng, b.location.lat, b.location.lng);
        if (d < minDist) { minDist = d; nearest = b; }
      });
      return minDist < 500 ? nearest : null;
    }

    function clearMarkers() {
      // 마커를 통째로 지우므로 선택 표시도 같이 초기화한다
      selMarker = null;
      selOriginalImg = null;
      placedMarkers.forEach(function(m) { m.setMap(null); });
      placedMarkers = [];
    }

    function initMap(data) {
      ensureImages();
      mapBuildings = data.buildings || [];

      var myLat = data.myLocation.lat;
      var myLng = data.myLocation.lng;
      var myPos = new kakao.maps.LatLng(myLat, myLng);
      map.setCenter(myPos);

      // 내 위치 마커
      if (myMarker) myMarker.setMap(null);
      myMarker = new kakao.maps.Marker({
        position: myPos, map: map,
        image: new kakao.maps.MarkerImage(
          'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
          new kakao.maps.Size(24, 35)
        )
      });

      // ★ 기존 마커를 지우고 다시 그린다 (안 지우면 핀이 겹겹이 쌓인다)
      clearMarkers();

      // 건물 마커
      mapBuildings.forEach(function(b) {
        var normalImg = pinImage(isMineItem(b));
        var marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(b.location.lat, b.location.lng),
          map: map, title: b.name,
          image: normalImg
        });
        kakao.maps.event.addListener(marker, 'click', function() {
          selectPin(marker, normalImg, PIN_SELECTED);
          showOverlay(b, false);
        });
        placedMarkers.push(marker);
      });

      // 알림 마커
      (data.alertPoints || []).forEach(function(a) {
        var marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(a.location.lat, a.location.lng),
          map: map,
          image: ALERT_IMG,
          title: a.name
        });
        kakao.maps.event.addListener(marker, 'click', function() {
          // 알림 마커는 원래 빨간 아이콘이라 색 대신 크기로 구분한다
          selectPin(marker, ALERT_IMG, ALERT_IMG_SELECTED);
          showOverlay(a, true);
        });
        placedMarkers.push(marker);
      });
    }

    function setupLongPress() {
      var el = document.getElementById('map');
      var touchTimer = null, touchLatLng = null;

      el.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        if (!map) return;
        // ★ 메모창 위에서 시작한 터치는 지도의 롱프레스로 치지 않는다.
        //   (메모창이 지도 안에 들어있는 DOM이라 그냥 두면 둘 다 발동한다)
        if (e.target && e.target.closest && e.target.closest('.overlay')) return;
        var touch = e.touches[0];
        var rect = el.getBoundingClientRect();
        var proj = map.getProjection();
        var point = new kakao.maps.Point(touch.clientX - rect.left, touch.clientY - rect.top);
        touchLatLng = proj.coordsFromContainerPoint(point);

        clearTimeout(touchTimer);
        touchTimer = setTimeout(function() {
          if (!touchLatLng) return;
          var lat = touchLatLng.getLat();
          var lng = touchLatLng.getLng();
          var nearest = findNearest(lat, lng);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'LONG_PRESS', lat: lat, lng: lng,
            nearest: nearest ? {
              id: nearest.id, name: nearest.name,
              memo: nearest.memo || '', memo2: nearest.memo2 || '',
              note: nearest.note || '', shortcut: nearest.shortcut || ''
            } : null
          }));
        }, 800);
      }, { passive: true });

      el.addEventListener('touchend', function() { clearTimeout(touchTimer); });
      el.addEventListener('touchmove', function() { clearTimeout(touchTimer); });
      el.addEventListener('touchcancel', function() { clearTimeout(touchTimer); });
    }

    function showOverlay(item, isAlert) {
      if (currentOverlay) { currentOverlay.setMap(null); currentOverlay = null; }
      var typeNames = { rear: '후방카메라', front: '전방카메라', parking: '주차단속', etc: '알림구역' };
      var mine = !isAlert && isMineItem(item);
      var scopeLine = '';
      if (!isAlert) {
        scopeLine = mine
          ? '<div class="overlay-scope overlay-scope-mine">내 폰에만</div>'
          : '<div class="overlay-scope overlay-scope-public">공용</div>';
      }
      var content = '<div class="ov-wrap">' +
        '<div class="overlay' + (isAlert ? ' overlay-alert' : '') + (mine ? ' overlay-mine' : '') + '" id="ov_' + item.id + '">' +
          (isAlert ? '<div class="overlay-type">⚠ ' + esc(typeNames[item.alertType] || '알림구역') + '</div>' : '') +
          scopeLine +
          '<div class="overlay-head">' +
            '<div class="overlay-name">' + esc(item.name) + '</div>' +
            '<div class="overlay-close" onclick="closeOverlay()">×</div>' +
          '</div>' +
          (item.memo ? '<div class="overlay-memo">' + esc(item.memo) + '</div>' : '') +
          (item.memo2 ? '<div class="overlay-memo overlay-memo2">' + esc(item.memo2) + '</div>' : '') +
          '<div class="overlay-hint">빠르게 두 번 탭 → 상세보기</div>' +
        '</div>' +
        '<div class="ov-tail"></div>' +
      '</div>';
      // yAnchor: 1 = 껍데기의 맨 아래가 핀 끝에 붙는다.
      // 껍데기 아래쪽 50px가 투명 여백이라 상자는 핀 바로 위에 뜬다.
      // (예전 2.2는 상자 높이의 2.2배만큼 위로 밀어올려서 엉뚱한 곳에 떴다)
      var overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(item.location.lat, item.location.lng),
        content: content, yAnchor: 1, map: map
      });
      currentOverlay = overlay;

      setTimeout(function() {
        var el = document.getElementById('ov_' + item.id);
        if (!el) return;

        var lastTapAt = 0;

        // 닫기(×) 버튼인지 확인
        function isCloseBtn(t) {
          return t && t.className && String(t.className).indexOf('overlay-close') > -1;
        }

        el.addEventListener('touchstart', function(e) {
          // 지도로 터치가 새어나가지 않게 막는다 (지도 확대/이동 방지)
          e.stopPropagation();
          if (isCloseBtn(e.target)) return;
          e.preventDefault();
        }, { passive: false });

        el.addEventListener('touchend', function(e) {
          e.stopPropagation();

          if (isCloseBtn(e.target)) { closeOverlay(); return; }

          // ── 빠르게 두 번 탭하면 상세보기 ──
          var now = Date.now();
          if (now - lastTapAt < 400) {
            lastTapAt = 0;
            closeOverlay();
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MARKER_CLICK', id: item.id, kind: isAlert ? 'alert' : 'building'
            }));
          } else {
            lastTapAt = now;
          }
        }, { passive: false });
      }, 100);
    }

    function closeOverlay() {
      if (currentOverlay) { currentOverlay.setMap(null); currentOverlay = null; }
      clearPinSelection();   // 창을 닫으면 핀 색도 원래대로
    }
  </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={styles.map}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
      />
      {/* 핀 색 안내 */}
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: '#075B4B' }]} />
          <Text style={styles.legendText}>내 폰 {shown.mine}</Text>
          <View style={[styles.dot, { backgroundColor: '#185FA5', marginLeft: 10 }]} />
          <Text style={styles.legendText}>공용 {shown.pub}</Text>
        </View>
        <Text style={styles.legendHint}>주변 {MAP_RADIUS_KM}km · 전체 {shown.total}건</Text>
      </View>

      {/* 내 위치 버튼 */}
      <TouchableOpacity style={styles.myLocBtn} onPress={moveToMyLocation}>
        <Text style={styles.myLocBtnText}>📍</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  myLocBtn: {
    position: 'absolute', bottom: 30, right: 16,
    backgroundColor: '#fff', borderRadius: 30, width: 52, height: 52,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 6
  },
  myLocBtnText: { fontSize: 24 },
  legend: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 5 },
  legendText: { fontSize: 13, color: '#1A1A18', fontWeight: '500' },
  legendHint: { fontSize: 11, color: '#6E6C66', marginTop: 3 },
});