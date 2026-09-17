package com.richcompany.smartridernative3

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

class ProximityOverlayService : Service() {

    private lateinit var windowManager: WindowManager

    private data class ToastEntry(
        val view: View,
        val params: WindowManager.LayoutParams,
        var pinned: Boolean = false,
        var dismissRunnable: Runnable? = null
    )

    // 판정에 쓰는 건물 하나
    private data class Building(
        val id: String,
        val name: String,
        val memo: String,
        val memo2: String,          // 백업 출입정보 (없으면 빈 문자열)
        val lat: Double,
        val lng: Double
    )

    // 강력 알림 지점 (후방카메라 / 주차단속 등)
    private data class AlertPoint(
        val id: String,
        val name: String,
        val type: String,       // rear | front | parking | etc
        val lat: Double,
        val lng: Double
    )

    private val activeToasts = linkedMapOf<String, ToastEntry>()
    private val handler = Handler(Looper.getMainLooper())

    // ── 위치 수신 ──
    private var fusedClient: FusedLocationProviderClient? = null
    private var ktCallback: LocationCallback? = null
    private var lastLocationAt = 0L      // 마지막 위치 수신 시각 (알림 표시용)

    // ── 판정 데이터 ──
    private var buildings: List<Building> = emptyList()
    private var radius = 20.0
    private var alertPoints: List<AlertPoint> = emptyList()
    // 알림 재무장 상태: true면 다음 진입 때 울린다.
    // 100m 안에서 울린 뒤 200m 밖으로 나가야 다시 true가 된다. (경계 들락날락 방지)
    private val alertArmed = HashMap<String, Boolean>()
    private var alertEnterRadius = 100.0
    private var alertExitRadius = 200.0
    private var alertSoundOn = true

    private val dwellMap = HashMap<String, Long>()      // 반경 안에 처음 들어온 시각
    private val cooldownMap = HashMap<String, Long>()   // 마지막으로 토스트 띄운 시각

    // 속도 직접 계산용 직전 좌표
    private var lastFixLat = 0.0
    private var lastFixLng = 0.0
    private var lastFixAt = 0L

    private var notifManager: NotificationManager? = null

    // ── 플로팅 버튼 ──
    private var floatingView: View? = null
    private var floatingParams: WindowManager.LayoutParams? = null
    private var panelView: View? = null
    private var panelCloseRunnable: Runnable? = null
    private var floatingEnabled = true
    private lateinit var prefs: SharedPreferences

    // 최근 좌표 (지도 이동 / 패널 계산용)
    private var curLat = 0.0
    private var curLng = 0.0

    private val healthChecker = object : Runnable {
        override fun run() {
            updateNotification()
            ensureFloatingButton()                    // ★ 새 줄
            handler.postDelayed(this, CHECK_INTERVAL)
        }
    }

    companion object {
        const val CHANNEL_ID = "smartrider_proximity"
        const val ACTION_SHOW_TOAST = "com.richcompany.smartridernative3.SHOW_TOAST"
        const val ACTION_DISMISS_ALL = "com.richcompany.smartridernative3.DISMISS_TOASTS"
        const val ACTION_SET_BUILDINGS = "com.richcompany.smartridernative3.SET_BUILDINGS"
        const val ACTION_SET_ALERTS = "com.richcompany.smartridernative3.SET_ALERTS"
        const val ACTION_CLEAR_MUTES = "com.richcompany.smartridernative3.CLEAR_MUTES"
        const val ACTION_REQUEST_MUTE_COUNT = "com.richcompany.smartridernative3.REQ_MUTE_COUNT"
        const val EXTRA_PAYLOAD = "payload"
        const val AUTO_DISMISS = 15000L
        const val MAX_TOASTS = 3
        const val CARD_HEIGHT_ESTIMATE = 170   // dp 단위. 토스트 한 장의 대략 높이(세로로 쌓을 간격)
        const val NOTI_ID = 2
        const val CHECK_INTERVAL = 15000L
        const val STALE_THRESHOLD = 120000L

        // 판정 기준 (JS에 있던 값 그대로)
        const val SPEED_THRESHOLD = 2.5     // m/s 미만이어야 "도착"으로 봄
        const val DWELL_TIME = 3000L        // 반경 안에 이만큼 머물러야 함
        const val COOLDOWN = 300000L        // 같은 건물 재알림 최소 간격 (5분)
        const val MAX_CANDIDATES = 3

        const val DOUBLE_TAP_WINDOW = 400L
        const val TAG = "PROX_KT"

        // 플로팅 버튼
        const val ACTION_SET_FLOATING = "com.richcompany.smartridernative3.SET_FLOATING"
        const val ACTION_STOP_ALL = "com.richcompany.smartridernative3.STOP_ALL"
        const val EXTRA_ENABLED = "enabled"
        const val PANEL_RADIUS = 30.0       // 패널에 보여줄 최대 거리(m)
        const val PANEL_MAX_ITEMS = 5
        const val PREFS = "prox_prefs"
        const val KEY_FLOATING = "floating_enabled"

        // 강력 알림
        const val ALERT_AUTO_DISMISS = 30000L      // 일반 토스트(15초)보다 길게
        const val KEY_MUTE_FOREVER = "alert_mute_forever"
        const val KEY_MUTE_TODAY = "alert_mute_today"
    }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                ACTION_SHOW_TOAST -> {
                    val json = intent.getStringExtra(EXTRA_PAYLOAD) ?: return
                    try { showToast(JSONObject(json)) } catch (e: Exception) { e.printStackTrace() }
                }
                ACTION_DISMISS_ALL -> dismissAll()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // ★ 여기부터 새 블록
        // onCreate에서 막아도 인텐트가 또 오면 서비스가 되살아난다.
        // startForeground를 못 부른 채 5초가 지나면 시스템이 프로세스를 죽인다.
        if (!hasLocationPermission()) {
            android.util.Log.d(TAG, "위치 권한 없음 - 명령 무시")
            stopSelf()
            return START_NOT_STICKY
        }
        // ★ 새 블록 끝

        when (intent?.action) {
            ACTION_SHOW_TOAST -> {
                val json = intent.getStringExtra(EXTRA_PAYLOAD)
                if (json != null) {
                    handler.post {
                        try { showToast(JSONObject(json)) } catch (e: Exception) { e.printStackTrace() }
                    }
                }
            }
            ACTION_DISMISS_ALL -> handler.post { dismissAll() }
            ACTION_STOP_ALL -> {
                android.util.Log.d(TAG, "사용자가 알림에서 종료 요청")
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SET_FLOATING -> {
                val on = intent.getBooleanExtra(EXTRA_ENABLED, true)
                handler.post { setFloatingEnabled(on) }
            }
            ACTION_SET_BUILDINGS -> {
                val json = intent.getStringExtra(EXTRA_PAYLOAD)
                if (json != null) handler.post { setBuildings(json) }
            }
            ACTION_SET_ALERTS -> {
                val json = intent.getStringExtra(EXTRA_PAYLOAD)
                if (json != null) handler.post { setAlertPoints(json) }
            }
            ACTION_CLEAR_MUTES -> handler.post { clearAllMutes() }
            ACTION_REQUEST_MUTE_COUNT -> handler.post { emitMuteCount() }
        }
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()

        // ★ 여기부터 새 블록
        // 권한 없이 살아나면 startForeground에서 프로세스가 죽는다.
        // 조용히 물러난다. PermissionScreen에서 허용하면 다시 켜진다.
        if (!hasLocationPermission()) {
            android.util.Log.d(TAG, "위치 권한 없음 - 서비스 시작 취소")
            stopSelf()
            return
        }
        // ★ 새 블록 끝

        createChannel()
        notifManager = getSystemService(NotificationManager::class.java)

        val notification = buildNotification("위치 확인 대기 중...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTI_ID, notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTI_ID, notification)
        }

        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        val filter = IntentFilter().apply {
            addAction(ACTION_SHOW_TOAST)
            addAction(ACTION_DISMISS_ALL)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(receiver, filter)
        }

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        floatingEnabled = prefs.getBoolean(KEY_FLOATING, true)

        handler.postDelayed(healthChecker, CHECK_INTERVAL)
        startLocationUpdates()

        if (floatingEnabled) handler.postDelayed({ showFloatingButton() }, 800)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(healthChecker)
        stopLocationUpdates()
        try { unregisterReceiver(receiver) } catch (e: Exception) {}
        dismissAll()
        hidePanel()
        hideFloatingButton()
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    // ────────────────────────────────────────────
    //  건물 목록 (JS가 넘겨줌)
    // ────────────────────────────────────────────

    private fun setBuildings(json: String) {
        try {
            val root = JSONObject(json)
            radius = root.optDouble("radius", 20.0)
            val arr: JSONArray = root.getJSONArray("buildings")
            val list = ArrayList<Building>(arr.length())

            for (i in 0 until arr.length()) {
                val b = arr.getJSONObject(i)
                val lat = b.optDouble("lat", Double.NaN)
                val lng = b.optDouble("lng", Double.NaN)
                if (lat.isNaN() || lng.isNaN()) continue
                list.add(
                    Building(
                        id = b.optString("id", ""),
                        name = b.optString("name", ""),
                        memo = b.optString("memo", ""),
                        memo2 = b.optString("memo2", ""),
                        lat = lat,
                        lng = lng
                    )
                )
            }
            buildings = list
            android.util.Log.d(TAG, "건물 목록 수신: ${list.size}개, 반경 ${radius.toInt()}m")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "건물 목록 파싱 실패: " + e.message)
        }
    }

    private fun setAlertPoints(json: String) {
        try {
            val root = JSONObject(json)
            alertEnterRadius = root.optDouble("enterRadius", 100.0)
            alertExitRadius = root.optDouble("exitRadius", 200.0)
            alertSoundOn = root.optBoolean("sound", true)
            val arr: JSONArray = root.getJSONArray("points")
            val list = ArrayList<AlertPoint>(arr.length())

            for (i in 0 until arr.length()) {
                val a = arr.getJSONObject(i)
                val lat = a.optDouble("lat", Double.NaN)
                val lng = a.optDouble("lng", Double.NaN)
                if (lat.isNaN() || lng.isNaN()) continue
                list.add(
                    AlertPoint(
                        id = a.optString("id", ""),
                        name = a.optString("name", ""),
                        type = a.optString("type", "etc"),
                        lat = lat,
                        lng = lng
                    )
                )
            }
            alertPoints = list
            android.util.Log.d(TAG, "알림지점 수신: ${list.size}개, 진입 ${alertEnterRadius.toInt()}m / " +
                    "해제 ${alertExitRadius.toInt()}m, 소리 " + (if (alertSoundOn) "켬" else "끔"))
        } catch (e: Exception) {
            android.util.Log.e(TAG, "알림지점 파싱 실패: " + e.message)
        }
    }

    // ────────────────────────────────────────────
    //  위치 수신 + 판정
    // ────────────────────────────────────────────

    private fun startLocationUpdates() {
        val granted = ContextCompat.checkSelfPermission(
            this, android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

        if (!granted) {
            android.util.Log.e(TAG, "위치 권한 없음 — 수신 시작 못함")
            return
        }

        try {
            fusedClient = LocationServices.getFusedLocationProviderClient(this)

            val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
                .setMinUpdateIntervalMillis(3000L)
                .setMinUpdateDistanceMeters(0f)
                .build()

            val cb = object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    val loc = result.lastLocation ?: return
                    lastLocationAt = System.currentTimeMillis()
                    onNewLocation(loc.latitude, loc.longitude,
                        if (loc.hasSpeed()) loc.speed.toDouble() else -1.0)
                }
            }
            ktCallback = cb
            fusedClient?.requestLocationUpdates(request, cb, Looper.getMainLooper())
            android.util.Log.d(TAG, "위치 수신 등록 완료")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "위치 수신 등록 실패: " + e.message)
        }
    }

    private fun stopLocationUpdates() {
        try {
            ktCallback?.let { fusedClient?.removeLocationUpdates(it) }
            ktCallback = null
        } catch (e: Exception) { e.printStackTrace() }
    }

    // 두 좌표 사이 거리 (미터)
    private fun distanceMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLng / 2) * sin(dLng / 2)
        return r * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    // 기기가 속도를 안 주면 직전 좌표와의 거리로 직접 계산한다
    private fun resolveSpeed(lat: Double, lng: Double, rawSpeed: Double, now: Long): Double {
        var spd = if (rawSpeed < 0) -1.0 else rawSpeed
        if (spd < 0 && lastFixAt > 0) {
            val dt = (now - lastFixAt) / 1000.0
            if (dt > 0.5) {
                spd = distanceMeters(lastFixLat, lastFixLng, lat, lng) / dt
            }
        }
        lastFixLat = lat
        lastFixLng = lng
        lastFixAt = now
        return if (spd < 0) 0.0 else spd
    }

    private fun onNewLocation(lat: Double, lng: Double, rawSpeed: Double) {
        val now = System.currentTimeMillis()
        curLat = lat
        curLng = lng
        val speed = resolveSpeed(lat, lng, rawSpeed, now)

        // ★ 강력 알림은 건물 판정과 완전히 별개다.
        //   속도·체류 조건이 없고, 건물 목록이 비어 있어도 동작해야 하므로
        //   아래 buildings.isEmpty() 검사보다 먼저 실행한다.
        checkAlerts(lat, lng)

        if (buildings.isEmpty()) {
            android.util.Log.d(TAG, "위치 수신했으나 건물 목록이 비어있음")
            return
        }

        val candidates = ArrayList<Pair<Building, Double>>()
        var nearestName = ""
        var nearestDist = Double.MAX_VALUE

        for (b in buildings) {
            val dist = distanceMeters(lat, lng, b.lat, b.lng)
            if (dist < nearestDist) { nearestDist = dist; nearestName = b.name }

            if (dist <= radius) {
                if (!dwellMap.containsKey(b.id)) dwellMap[b.id] = now
                val dwell = now - (dwellMap[b.id] ?: now)
                val okSpeed = speed < SPEED_THRESHOLD
                val okDwell = dwell > DWELL_TIME

                android.util.Log.d(
                    TAG,
                    "반경내 ${b.name} 거리${dist.toInt()}m " +
                    "속도${String.format("%.1f", speed)}${if (okSpeed) "O" else "X"} " +
                    "체류${dwell / 1000}초${if (okDwell) "O" else "X"}"
                )

                if (okSpeed && okDwell) candidates.add(Pair(b, dist))
            } else {
                dwellMap.remove(b.id)
            }
        }

        if (nearestName.isNotEmpty()) {
            android.util.Log.d(TAG, "위치 ${String.format("%.6f", lat)}, ${String.format("%.6f", lng)} " +
                    "속도${String.format("%.1f", speed)} 최근접 $nearestName ${nearestDist.toInt()}m (반경${radius.toInt()}m)")
        }

        if (candidates.isEmpty()) return

        // 가까운 순으로 정렬 후 최대 3개
        candidates.sortBy { it.second }
        val top = candidates.take(MAX_CANDIDATES)

        // 쿨다운 통과한 것만
        val fresh = top.filter { now - (cooldownMap[it.first.id] ?: 0L) > COOLDOWN }
        if (fresh.isEmpty()) {
            android.util.Log.d(TAG, "쿨다운으로 스킵")
            return
        }
        fresh.forEach { cooldownMap[it.first.id] = now }

        // 토스트 payload 만들기 (기존 형식 그대로)
        val id = "overlay_$now"
        val payload = JSONObject()
        payload.put("id", id)

        if (fresh.size == 1) {
            val b = fresh[0].first
            payload.put("type", "single")
            payload.put("buildingId", b.id)
            payload.put("name", b.name)
            payload.put("memo", b.memo)
            payload.put("memo2", b.memo2)
            payload.put("dist", fresh[0].second.toInt())   // 토스트에 "45m" 표시용
        } else {
            payload.put("type", "cluster")
            val arr = JSONArray()
            for ((b, _) in fresh) {
                val o = JSONObject()
                o.put("buildingId", b.id)
                o.put("name", b.name)
                o.put("memo", b.memo)
                o.put("memo2", b.memo2)
                arr.put(o)
            }
            payload.put("candidates", arr)
        }

        android.util.Log.d(TAG, "오버레이 발사! " + fresh.joinToString(",") { it.first.name })
        handler.post {
            try { showToast(payload) } catch (e: Exception) { e.printStackTrace() }
        }
    }

    // ────────────────────────────────────────────
    //  강력 알림 (후방카메라 / 주차단속)
    //
    //  방침: "여기 카메라가 있습니다"를 알려줄 뿐이다.
    //        속도를 재지도, 과속인지 따지지도 않는다.
    //        정보를 줄 뿐이고 쓸지 말지는 라이더가 정한다.
    // ────────────────────────────────────────────

    private fun typeLabel(type: String): String = when (type) {
        "rear" -> "후방카메라"
        "front" -> "전방카메라"
        "parking" -> "주차단속"
        else -> "알림구역"
    }

    private fun todayKey(): String {
        val c = java.util.Calendar.getInstance()
        return "%04d%02d%02d".format(
            c.get(java.util.Calendar.YEAR),
            c.get(java.util.Calendar.MONTH) + 1,
            c.get(java.util.Calendar.DAY_OF_MONTH)
        )
    }

    // 앱이 꺼져 있어도 동작해야 하므로 JS를 거치지 않고 여기서 직접 저장한다
    private fun isMuted(id: String): Boolean {
        val forever = prefs.getStringSet(KEY_MUTE_FOREVER, emptySet()) ?: emptySet()
        if (forever.contains(id)) return true
        val today = prefs.getStringSet(KEY_MUTE_TODAY, emptySet()) ?: emptySet()
        return today.contains(id + "|" + todayKey())
    }

    private fun muteForever(id: String) {
        val cur = HashSet(prefs.getStringSet(KEY_MUTE_FOREVER, emptySet()) ?: emptySet())
        cur.add(id)
        prefs.edit().putStringSet(KEY_MUTE_FOREVER, cur).apply()
        android.util.Log.d(TAG, "알림 영구 해제: $id")
        emitMuteCount()
    }

    private fun muteToday(id: String) {
        // 오래된 날짜는 정리하면서 오늘 것만 남긴다
        val key = todayKey()
        val cur = HashSet(
            (prefs.getStringSet(KEY_MUTE_TODAY, emptySet()) ?: emptySet())
                .filter { it.endsWith("|" + key) }
        )
        cur.add(id + "|" + key)
        prefs.edit().putStringSet(KEY_MUTE_TODAY, cur).apply()
        android.util.Log.d(TAG, "알림 오늘 해제: $id")
        emitMuteCount()
    }

    // 설정화면에서 "안 보기로 한 지점"을 보여주고 되돌리기 위한 것들.
    // 실수로 "앞으로 안 봄"을 눌렀을 때 되돌릴 방법이 없으면 위험하다.
    fun countMutes(): Int {
        val forever = prefs.getStringSet(KEY_MUTE_FOREVER, emptySet()) ?: emptySet()
        val today = (prefs.getStringSet(KEY_MUTE_TODAY, emptySet()) ?: emptySet())
            .filter { it.endsWith("|" + todayKey()) }
        return forever.size + today.size
    }

    private fun clearAllMutes() {
        prefs.edit()
            .remove(KEY_MUTE_FOREVER)
            .remove(KEY_MUTE_TODAY)
            .apply()
        android.util.Log.d(TAG, "안 보기로 한 지점 전체 해제")
        emitMuteCount()
    }

    private fun emitMuteCount() {
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext ?: return
            val map = com.facebook.react.bridge.Arguments.createMap()
            map.putInt("count", countMutes())
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("ProximityMuteCount", map)
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun checkAlerts(lat: Double, lng: Double) {
        if (alertPoints.isEmpty()) return

        for (a in alertPoints) {
            val d = distanceMeters(lat, lng, a.lat, a.lng)
            val armed = alertArmed[a.id] ?: true

            if (d <= alertEnterRadius) {
                if (!armed) continue
                alertArmed[a.id] = false          // 나갔다 와야 다시 울린다

                if (isMuted(a.id)) {
                    android.util.Log.d(TAG, "알림 음소거됨 — ${a.name}")
                    continue
                }

                android.util.Log.d(TAG, "🚨 강력알림 발사! ${a.name} ${d.toInt()}m")
                handler.post { showAlertToast(a, d) }

            } else if (d > alertExitRadius) {
                if (!armed) android.util.Log.d(TAG, "알림 재무장 — ${a.name}")
                alertArmed[a.id] = true
            }
        }
    }

    private fun playAlertSound() {
        if (!alertSoundOn) {
            android.util.Log.d(TAG, "알림음 꺼져 있음")
            return
        }
        try {
            val uri = android.net.Uri.parse(
                "android.resource://" + packageName + "/" + R.raw.smartrider4
            )
            val mp = android.media.MediaPlayer()
            // 알람 계통으로 내보낸다. 헬멧 쓰고 달리는 중이 기준이므로
            // 일반 알림음 볼륨에 묻히면 의미가 없다.
            mp.setAudioAttributes(
                android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            mp.setDataSource(applicationContext, uri)
            mp.setOnCompletionListener { it.release() }
            mp.setOnErrorListener { p, _, _ ->
                try { p.release() } catch (e: Exception) {}
                playFallbackSound()
                true
            }
            mp.prepare()
            mp.start()
        } catch (e: Exception) {
            android.util.Log.e(TAG, "알림음 재생 실패: " + e.message)
            playFallbackSound()
        }
    }

    // 음원이 없거나 깨졌을 때의 안전망. 예전 동작 그대로.
    private fun playFallbackSound() {
        try {
            val uri = android.media.RingtoneManager
                .getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION) ?: return
            val ringtone = android.media.RingtoneManager.getRingtone(applicationContext, uri)
            ringtone?.play()
            handler.postDelayed({ try { ringtone?.stop() } catch (e: Exception) {} }, 4000)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "기본 알림음도 실패: " + e.message)
        }
    }

    private fun showAlertToast(point: AlertPoint, dist: Double) {
        val id = "alert_" + point.id + "_" + System.currentTimeMillis()
        if (activeToasts.containsKey(id)) return

        try {
            val root = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = GradientDrawable().apply {
                    cornerRadius = dp(14).toFloat()
                    setColor(Color.parseColor("#FBFAF7"))
                    // 강력알림만 빨강 테두리. 일반 토스트와 한눈에 갈린다
                    setStroke(dp(3), Color.parseColor("#C62828"))
                }
                elevation = dp(8).toFloat()
            }

            root.addView(TextView(this).apply {
                text = typeLabel(point.type)
                setTextColor(Color.parseColor("#C62828"))
                textSize = 22f
            })

            root.addView(TextView(this).apply {
                text = point.name + "  " + dist.toInt() + "m"
                setTextColor(Color.parseColor("#1A1A18"))
                textSize = 15f
                setPadding(0, dp(5), 0, 0)
            })

            val hint = TextView(this).apply {
                text = "탭 → 알림 끄기 · 밀어서 닫기"
                setTextColor(Color.parseColor("#9A968C"))
                textSize = 11f
                setPadding(0, dp(8), 0, 0)
            }
            root.addView(hint)

            // 탭하면 나타나는 두 개의 선택지
            fun muteButton(label: String, action: () -> Unit): TextView =
                TextView(this).apply {
                    text = label
                    setTextColor(Color.WHITE)
                    textSize = 13f
                    gravity = Gravity.CENTER
                    background = GradientDrawable().apply {
                        cornerRadius = dp(8).toFloat()
                        setColor(Color.parseColor("#C62828"))
                    }
                    layoutParams = LinearLayout.LayoutParams(0, dp(48), 1f).apply {
                        setMargins(dp(3), 0, dp(3), 0)
                    }
                    setOnClickListener {
                        action()
                        removeToast(id)
                    }
                }

            val buttonRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(10), 0, 0)
                visibility = View.GONE
                addView(muteButton("오늘은 그만") { muteToday(point.id) })
                addView(muteButton("앞으로 안 봄") { muteForever(point.id) })
            }
            root.addView(buttonRow)

            val params = WindowManager.LayoutParams(
                dp(300),
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.END
                x = dp(10)
                y = dp(56) + activeToasts.size * dp(CARD_HEIGHT_ESTIMATE)
            }

            val entry = ToastEntry(root, params)
            activeToasts[id] = entry

            var startX = 0f
            var startParamX = 0
            var isDragging = false

            root.setOnTouchListener { _, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        startX = event.rawX
                        startParamX = params.x
                        isDragging = false
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = event.rawX - startX
                        if (abs(dx) > 10 && !isDragging) isDragging = true
                        if (isDragging && dx < 0) {
                            params.x = (startParamX - dx).toInt()
                            try { windowManager.updateViewLayout(root, params) } catch (e: Exception) {}
                        }
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (isDragging) {
                            val dx = event.rawX - startX
                            // 밀어서 닫으면 아무것도 저장하지 않는다 → 다음에 또 울린다
                            if (abs(dx) > 80) removeToast(id)
                            else {
                                params.x = dp(10)
                                try { windowManager.updateViewLayout(root, params) } catch (e: Exception) {}
                            }
                        } else {
                            // 탭 → 선택지 펼치기. 자동으로 닫히지 않게 타이머도 멈춘다
                            buttonRow.visibility = View.VISIBLE
                            hint.text = "알림을 끄지 않으면 다음에 또 알려줍니다"
                            entry.pinned = true
                            entry.dismissRunnable?.let { handler.removeCallbacks(it) }
                        }
                        true
                    }
                    else -> false
                }
            }

            windowManager.addView(root, params)

            val dismissRunnable = Runnable { removeToast(id) }
            entry.dismissRunnable = dismissRunnable
            handler.postDelayed(dismissRunnable, ALERT_AUTO_DISMISS)

            playAlertSound()
        } catch (e: Exception) {
            android.util.Log.e(TAG, "강력알림 표시 실패: " + e.message)
        }
    }

    // ────────────────────────────────────────────
    //  플로팅 버튼 + 미니패널
    //  토스트와 완전히 별개로 동작한다.
    //  토스트가 사라졌든 쿨다운에 걸렸든 상관없이
    //  "지금 이 순간 근처에 있는 건물"을 보여준다.
    // ────────────────────────────────────────────

    private fun dp(v: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics
    ).toInt()

    fun setFloatingEnabled(on: Boolean) {
        floatingEnabled = on
        prefs.edit().putBoolean(KEY_FLOATING, on).apply()
        if (on) showFloatingButton() else { hidePanel(); hideFloatingButton() }
        android.util.Log.d(TAG, "플로팅 버튼 " + if (on) "켜짐" else "꺼짐")
    }

    // ★ 여기부터 새 함수 2개 ─────────────────────────────

    /**
     * 개발문서 4장 해결.
     * 오버레이 권한이 없으면 addView가 실패하는데 JS는 그걸 모른다.
     * 나중에 권한을 켜도 스스로 다시 그리지 않아
     * "설정엔 켜짐인데 버튼이 없다"가 된다.
     * healthChecker가 15초마다 불러서 자동 복구한다.
     */
    private fun ensureFloatingButton() {
        if (!floatingEnabled) return        // 사용자가 끈 상태면 건드리지 않는다
        if (floatingView != null) return    // 이미 떠 있으면 할 일 없음
        if (!hasOverlay()) return           // 아직 권한 없음. 다음 바퀴에 다시 본다
        android.util.Log.d(TAG, "권한 확인됨 - 플로팅 버튼 자동 재시도")
        showFloatingButton()
    }

    private fun hasOverlay(): Boolean =
        android.provider.Settings.canDrawOverlays(this)

    // ★ 여기부터 새 함수
    /**
     * 위치 권한이 없는데 FGS_TYPE_LOCATION으로 startForeground를 하면
     * 안드로이드가 SecurityException으로 프로세스를 죽인다. (targetSdk 34+)
     * 권한 화면을 통과하기 전에는 이 상태가 정상적으로 존재하므로
     * onCreate에서 반드시 먼저 확인한다.
     */
    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            this, android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            this, android.Manifest.permission.ACCESS_COARSE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }
    // ★ 새 함수 끝

    // ★ 새 함수 끝 ──────────────────────────────────────

    private fun showFloatingButton() {
        if (floatingView != null) return
        if (!hasOverlay()) {                                          // ★ 새 줄
            android.util.Log.d(TAG, "오버레이 권한 없음 - 표시 보류")   // ★ 새 줄
            return                                                    // ★ 새 줄
        }                                                             // ★ 새 줄
        try {
            // 앱의 FAB와 같은 얼굴로 맞춘다. 딥그린 원 + 흰 심볼.
            // 배민 화면 위에 상시 떠 있으므로 평소에는 70%로 물러나 있다가
            // 손이 닿는 순간 100%로 또렷해진다.
            val btn = ImageView(this).apply {
                setImageResource(R.drawable.ic_sr_symbol)
                scaleType = ImageView.ScaleType.FIT_CENTER
                setPadding(dp(13), dp(13), dp(13), dp(13))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#075B4B"))
                    setStroke(dp(2), Color.parseColor("#FBFAF7"))
                }
                alpha = 0.7f
            }

            val p = WindowManager.LayoutParams(
                dp(52), dp(52),
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = prefs.getInt("fab_x", dp(12))
                y = prefs.getInt("fab_y", dp(300))
            }

            var downX = 0f
            var downY = 0f
            var startPX = 0
            var startPY = 0
            var moved = false
            var downAt = 0L

            btn.setOnTouchListener { _, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        downX = event.rawX; downY = event.rawY
                        startPX = p.x; startPY = p.y
                        moved = false
                        downAt = System.currentTimeMillis()
                        btn.alpha = 1.0f          // 만지는 동안 또렷하게
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = event.rawX - downX
                        val dy = event.rawY - downY
                        if (abs(dx) > dp(6) || abs(dy) > dp(6)) moved = true
                        if (moved) {
                            // 스냅 없이 자유롭게 이동
                            p.x = startPX + dx.toInt()
                            p.y = startPY + dy.toInt()
                            try { windowManager.updateViewLayout(btn, p) } catch (e: Exception) {}
                            hidePanel()
                        }
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        btn.alpha = 0.7f          // 손을 떼면 다시 물러난다
                        if (moved) {
                            prefs.edit().putInt("fab_x", p.x).putInt("fab_y", p.y).apply()
                        } else if (System.currentTimeMillis() - downAt < 500) {
                            togglePanel()
                        }
                        true
                    }
                    MotionEvent.ACTION_CANCEL -> {
                        btn.alpha = 0.7f
                        true
                    }
                    else -> false
                }
            }

            windowManager.addView(btn, p)
            floatingView = btn
            floatingParams = p
            android.util.Log.d(TAG, "플로팅 버튼 표시")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "플로팅 버튼 표시 실패: " + e.message)
        }
    }

    private fun hideFloatingButton() {
        floatingView?.let {
            try { windowManager.removeView(it) } catch (e: Exception) {}
        }
        floatingView = null
        floatingParams = null
    }

    private fun togglePanel() {
        if (panelView != null) { hidePanel(); return }

        // 지금 이 순간 근처(100m)에 있는 건물들
        val near = ArrayList<Pair<Building, Double>>()
        for (b in buildings) {
            val d = distanceMeters(curLat, curLng, b.lat, b.lng)
            if (d <= PANEL_RADIUS) near.add(Pair(b, d))
        }
        near.sortBy { it.second }
        val items = near.take(PANEL_MAX_ITEMS)

        // 근처에 건물이 없어도 패널을 연다.
        // (예전에는 곧바로 지도로 넘어가서 뒤로가기가 꼬였다)
        showPanel(items)
    }

    private fun showPanel(items: List<Pair<Building, Double>>) {
        try {
            val root = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(10), dp(10), dp(10), dp(10))
                background = GradientDrawable().apply {
                    cornerRadius = dp(14).toFloat()
                    setColor(Color.parseColor("#FBFAF7"))
                    setStroke(dp(1), Color.parseColor("#DCD8CE"))
                }
                elevation = dp(8).toFloat()
            }

            // 헤더
            root.addView(TextView(this).apply {
                text = if (items.isEmpty()) "근처에 등록된 건물이 없습니다"
                       else "근처 건물 " + items.size + "곳"
                setTextColor(Color.parseColor("#6E6C66"))
                textSize = 12f
                setPadding(dp(4), 0, dp(4), dp(6))
            })

            for ((b, dist) in items) {
                val row = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(dp(6), dp(10), dp(6), dp(10))
                }

                val title = TextView(this).apply {
                    text = b.name + "  " + dist.toInt() + "m"
                    setTextColor(Color.parseColor("#1A1A18"))
                    textSize = 15f
                }

                val memoLines = ArrayList<String>()
                if (b.memo.isNotEmpty()) memoLines.add(b.memo)
                if (b.memo2.isNotEmpty()) memoLines.add(b.memo2)

                val hasMemo = memoLines.isNotEmpty()
                val memo = TextView(this).apply {
                    text = if (hasMemo) memoLines.joinToString("\n") else "출입정보 없음"
                    setTextColor(Color.parseColor(if (hasMemo) "#075B4B" else "#9A968C"))
                    textSize = if (hasMemo) 22f else 13f
                    if (hasMemo) typeface = android.graphics.Typeface.MONOSPACE
                    setPadding(dp(4), dp(6), dp(4), 0)
                    visibility = View.GONE
                }

                val hint = TextView(this).apply {
                    text = "두 번 탭 → 상세보기"
                    setTextColor(Color.parseColor("#9A968C"))
                    textSize = 11f
                    setPadding(dp(4), dp(4), dp(4), 0)
                    visibility = View.GONE
                }

                row.addView(title)
                row.addView(memo)
                row.addView(hint)

                var opened = false
                var pendingTap: Runnable? = null

                // 표준 더블탭 처리:
                //   탭이 들어오면 곧바로 접기/펼치기를 하지 않고 300ms 기다린다.
                //   그 안에 두 번째 탭이 오면 = 더블탭 → 상세페이지
                //   안 오면 = 단일 탭 → 접기/펼치기
                // (예전 방식은 첫 탭이 먼저 접어버려서 더블탭이 성립하지 않았다)
                row.setOnClickListener {
                    val waiting = pendingTap
                    if (waiting != null) {
                        // ── 더블탭 ──
                        handler.removeCallbacks(waiting)
                        pendingTap = null
                        android.util.Log.d(TAG, "패널 더블탭 → 상세보기 (" + b.name + ")")
                        hidePanel()
                        openAppWithDetail(b.id)
                    } else {
                        // ── 단일 탭 후보. 300ms 뒤에 확정 ──
                        val r = Runnable {
                            pendingTap = null
                            opened = !opened
                            memo.visibility = if (opened) View.VISIBLE else View.GONE
                            hint.visibility = if (opened) View.VISIBLE else View.GONE
                        }
                        pendingTap = r
                        handler.postDelayed(r, 300)
                    }
                }

                root.addView(row)

                // 구분선
                root.addView(View(this).apply {
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, dp(1)
                    )
                    setBackgroundColor(Color.parseColor("#E5E1D8"))
                })
            }

            // 맨 아래: 항상 있는 두 개의 이동 버튼
            // 터치 영역 48dp — 장갑 끼고 흔들리는 상황에서도 눌리게
            fun panelButton(label: String, color: String, action: () -> Unit): TextView =
                TextView(this).apply {
                    text = label
                    setTextColor(Color.WHITE)
                    textSize = 14f
                    gravity = Gravity.CENTER
                    background = GradientDrawable().apply {
                        cornerRadius = dp(8).toFloat()
                        setColor(Color.parseColor(color))
                    }
                    layoutParams = LinearLayout.LayoutParams(0, dp(48), 1f).apply {
                        setMargins(dp(3), 0, dp(3), 0)
                    }
                    setOnClickListener { hidePanel(); action() }
                }

            root.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(10), 0, dp(2))
                addView(panelButton("앱 열기", "#6E6C66") { openAppHome() })
                addView(panelButton("지도 열기", "#075B4B") { openMapHere() })
            })

            // ── 패널 위치 계산 ──
            // 버튼이 화면 오른쪽/아래에 있으면 패널이 화면 밖으로 나가므로
            // 화면 크기를 보고 왼쪽/위쪽으로 펼친다.
            val screenW = resources.displayMetrics.widthPixels
            val screenH = resources.displayMetrics.heightPixels
            val panelW = dp(264)
            val btnSize = dp(52)
            val gap = dp(6)

            // 항목 하나당 대략적인 높이로 패널 높이를 추정
            val estHeight = dp(40) + items.size * dp(56) + dp(70)

            val bx = floatingParams?.x ?: dp(12)
            val by = floatingParams?.y ?: dp(300)

            // 가로: 버튼 왼쪽 정렬이 기본, 오른쪽으로 넘치면 오른쪽 정렬
            var px = bx
            if (px + panelW > screenW - dp(8)) {
                px = bx + btnSize - panelW      // 버튼 오른쪽 끝에 맞춤
            }
            if (px < dp(8)) px = dp(8)

            // 세로: 버튼 아래가 기본, 아래로 넘치면 버튼 위로
            var py = by + btnSize + gap
            if (py + estHeight > screenH - dp(8)) {
                py = by - estHeight - gap
            }
            if (py < dp(8)) py = dp(8)

            val p = WindowManager.LayoutParams(
                panelW,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = px
                y = py
            }

            windowManager.addView(root, p)
            panelView = root
            android.util.Log.d(TAG, "미니패널 표시 (" + items.size + "곳)")

            // 20초 뒤 자동으로 닫힘 (이전 패널의 타이머가 새 패널을 닫지 않도록 추적)
            val closeRunnable = Runnable { hidePanel() }
            panelCloseRunnable = closeRunnable
            handler.postDelayed(closeRunnable, 20000)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "미니패널 표시 실패: " + e.message)
        }
    }

    private fun hidePanel() {
        panelCloseRunnable?.let { handler.removeCallbacks(it) }
        panelCloseRunnable = null
        panelView?.let {
            try { windowManager.removeView(it) } catch (e: Exception) {}
        }
        panelView = null
    }

    // 현재 좌표를 들고 지도 화면으로 이동
    private fun openMapHere() {
        // ★ 요청마다 고유번호를 붙인다.
        //   아래에서 같은 요청을 3번 보내는데, JS가 번호를 보고 한 번만 처리한다.
        //   (예전에는 시간 간격으로 막으려다 3번 다 통과해서 지도가 3번 열렸다)
        val navId = System.currentTimeMillis()
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
            startActivity(launchIntent)
            android.util.Log.d(TAG, "지도 이동 요청 (" + curLat + ", " + curLng + ")")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "지도 이동 실패: " + e.message)
        }

        handler.postDelayed({ emitOpenMap(navId) }, 1200)
        handler.postDelayed({ emitOpenMap(navId) }, 2500)
        handler.postDelayed({ emitOpenMap(navId) }, 4000)
    }

    // 앱 홈화면으로 이동 (미니패널의 "앱 열기")
    private fun openAppHome() {
        val navId = System.currentTimeMillis()
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
            startActivity(launchIntent)
            android.util.Log.d(TAG, "앱 열기 요청")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "앱 열기 실패: " + e.message)
        }

        handler.postDelayed({ emitOpenHome(navId) }, 1200)
        handler.postDelayed({ emitOpenHome(navId) }, 2500)
    }

    private fun emitOpenHome(navId: Long) {
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext ?: return
            val map = com.facebook.react.bridge.Arguments.createMap()
            map.putString("navId", navId.toString())
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("ProximityOpenHome", map)
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun emitOpenMap(navId: Long) {
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext ?: return
            val map = com.facebook.react.bridge.Arguments.createMap()
            map.putDouble("lat", curLat)
            map.putDouble("lng", curLng)
            map.putString("navId", navId.toString())
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("ProximityOpenMap", map)
        } catch (e: Exception) { e.printStackTrace() }
    }

    // ────────────────────────────────────────────
    //  알림
    // ────────────────────────────────────────────

    private fun buildNotification(text: String): Notification {
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pending = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        // 알림의 "종료" 버튼 — 이걸 눌러야 서비스가 완전히 멈춘다
        val stopIntent = Intent(this, ProximityOverlayService::class.java).apply {
            action = ACTION_STOP_ALL
        }
        val stopPending = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("스마트라이더")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .setOngoing(true)
            .setContentIntent(pending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "종료", stopPending)
            .build()
    }

    private fun updateNotification() {
        val now = System.currentTimeMillis()
        val text: String

        if (lastLocationAt == 0L) {
            text = "위치 확인 대기 중..."
        } else {
            val age = now - lastLocationAt
            text = if (age > STALE_THRESHOLD) {
                "⚠️ 감지 중단됨 (${age / 1000}초)"
            } else {
                "감지 중 · ${age / 1000}초 전 위치 확인 · 건물 ${buildings.size}"
            }
        }

        try {
            notifManager?.notify(NOTI_ID, buildNotification(text))
        } catch (e: Exception) { e.printStackTrace() }
    }

    // ────────────────────────────────────────────
    //  앱 진입 (더블탭)
    // ────────────────────────────────────────────

    private fun openAppWithDetail(buildingId: String) {
        val navId = System.currentTimeMillis()
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent == null) {
                android.util.Log.e(TAG, "앱 실행 인텐트를 찾을 수 없음")
                return
            }
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
            launchIntent.putExtra("buildingId", buildingId)
            startActivity(launchIntent)
            android.util.Log.d(TAG, "더블탭 — 앱 실행 ($buildingId)")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "앱 실행 실패: " + e.message)
        }

        if (buildingId.isEmpty()) return

        // 앱 화면이 다 뜬 뒤에 보내야 한다.
        // 너무 일찍 보내면 navigate가 먹혔다가 앱 초기화에 덮어써진다.
        handler.postDelayed({ emitDetailRequest(buildingId, navId) }, 1200)
        handler.postDelayed({ emitDetailRequest(buildingId, navId) }, 2500)
        handler.postDelayed({ emitDetailRequest(buildingId, navId) }, 4000)
    }

    // ────────────────────────────────────────────
    //  토스트
    // ────────────────────────────────────────────

    private fun showToast(payload: JSONObject) {
        val id = payload.getString("id")
        if (activeToasts.containsKey(id)) return

        if (activeToasts.size >= MAX_TOASTS) {
            activeToasts.keys.firstOrNull()?.let { removeToast(it) }
        }

        val view = LayoutInflater.from(this).inflate(R.layout.toast_card, null)
        val nameView = view.findViewById<TextView>(R.id.toast_name)
        val memoView = view.findViewById<TextView>(R.id.toast_memo)
        val closeView = view.findViewById<TextView>(R.id.toast_close)
        val hintView = view.findViewById<TextView>(R.id.toast_hint)
        val distView = view.findViewById<TextView>(R.id.toast_dist)

        val type = payload.optString("type", "single")
        var buildingId = ""

        if (type == "cluster") {
            // 여러 건물이 걸렸을 때도 각 건물의 출입정보를 같이 보여준다
            val candidates = payload.getJSONArray("candidates")
            nameView.text = "근처 건물 ${candidates.length()}곳"
            val sb = StringBuilder()
            for (i in 0 until candidates.length()) {
                val c = candidates.getJSONObject(i)
                sb.append(c.optString("name", ""))
                val m1 = c.optString("memo", "")
                val m2 = c.optString("memo2", "")
                if (m1.isNotEmpty()) sb.append("\n").append(m1)
                if (m2.isNotEmpty()) sb.append("\n").append(m2)
                if (i < candidates.length() - 1) sb.append("\n\n")
            }
            memoView.text = sb.toString()
            // 여러 건물이 한 칸에 들어가므로 글자를 줄인다.
            // 한 건물일 때만 30sp 를 쓴다.
            memoView.textSize = 17f
            memoView.visibility = View.VISIBLE
            distView.visibility = View.GONE
        } else {
            buildingId = payload.optString("buildingId", "")
            val name = payload.optString("name", "")
            val memo = payload.optString("memo", "")
            val memo2 = payload.optString("memo2", "")
            nameView.text = name

            // 출입정보 1, 2를 있는 것만 줄바꿈해서 표시
            val lines = ArrayList<String>()
            if (memo.isNotEmpty()) lines.add(memo)
            if (memo2.isNotEmpty()) lines.add(memo2)

            if (lines.isEmpty()) {
                memoView.visibility = View.GONE
            } else {
                memoView.text = lines.joinToString("\n")
                memoView.textSize = 30f
                memoView.visibility = View.VISIBLE
            }

            val dist = payload.optInt("dist", -1)
            if (dist >= 0) {
                distView.text = dist.toString() + "m"
                distView.visibility = View.VISIBLE
            } else {
                distView.visibility = View.GONE
            }
        }

        hintView.text = if (type == "cluster") "두 번 탭 → 앱 열기" else "두 번 탭 → 상세보기"
        // 힌트를 처음부터 보여준다. 어떻게 쓰는지 모르면 기능이 없는 것과 같다
        hintView.visibility = View.VISIBLE

        val params = WindowManager.LayoutParams(
            dp(300),
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(10)
            y = dp(56) + activeToasts.size * dp(CARD_HEIGHT_ESTIMATE)
        }

        val entry = ToastEntry(view, params)
        activeToasts[id] = entry

        closeView.setOnClickListener { removeToast(id) }

        var pinned = false
        var lastTapAt = 0L
        var startX = 0f
        var startParamX = 0
        var isDragging = false

        view.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX
                    startParamX = params.x
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - startX
                    if (abs(dx) > 10 && !isDragging) isDragging = true
                    if (isDragging && dx < 0) {
                        params.x = (startParamX - dx).toInt()
                        try { windowManager.updateViewLayout(view, params) } catch (e: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (isDragging) {
                        val dx = event.rawX - startX
                        if (abs(dx) > 80) {
                            removeToast(id)
                        } else {
                            params.x = dp(10)
                            try { windowManager.updateViewLayout(view, params) } catch (e: Exception) {}
                        }
                    } else {
                        val now = System.currentTimeMillis()
                        if (now - lastTapAt < DOUBLE_TAP_WINDOW) {
                            // 두 번 탭 → 앱 진입
                            lastTapAt = 0L
                            removeToast(id)
                            openAppWithDetail(buildingId)
                        } else {
                            // 한 번 탭 → 고정만 한다.
                            // 내용은 처음부터 펼쳐져 있으므로 접지 않는다.
                            // (접히면 비번을 다시 보려고 또 손이 가야 한다)
                            lastTapAt = now
                            if (!pinned) {
                                pinned = true
                                entry.pinned = true
                                view.setBackgroundResource(R.drawable.toast_bg_pinned)
                                hintView.text = "고정됨 · 두 번 탭 → 상세보기"
                                entry.dismissRunnable?.let { handler.removeCallbacks(it) }
                            }
                        }
                    }
                    true
                }
                else -> false
            }
        }

        try {
            windowManager.addView(view, params)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        val dismissRunnable = Runnable { removeToast(id) }
        entry.dismissRunnable = dismissRunnable
        handler.postDelayed(dismissRunnable, AUTO_DISMISS)
    }

    private fun removeToast(id: String) {
        val entry = activeToasts[id] ?: return
        entry.dismissRunnable?.let { handler.removeCallbacks(it) }
        try { windowManager.removeView(entry.view) } catch (e: Exception) {}
        activeToasts.remove(id)
        repositionToasts()
    }

    private fun repositionToasts() {
        var index = 0
        for ((_, entry) in activeToasts) {
            entry.params.y = dp(56) + index * dp(CARD_HEIGHT_ESTIMATE)
            try { windowManager.updateViewLayout(entry.view, entry.params) } catch (e: Exception) {}
            index++
        }
    }

    private fun dismissAll() {
        for (id in activeToasts.keys.toList()) removeToast(id)
    }

    private fun emitDetailRequest(buildingId: String, navId: Long) {
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext
            if (reactContext == null) {
                android.util.Log.d(TAG, "상세 요청 보류 — JS 아직 준비 안 됨")
                return
            }
            val map = com.facebook.react.bridge.Arguments.createMap()
            map.putString("buildingId", buildingId)
            map.putString("navId", navId.toString())
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("ProximityToastDetailRequested", map)
            android.util.Log.d(TAG, "상세 요청 전송 ($buildingId)")
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "스마트라이더 근접알림",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setSound(null, null)
                enableVibration(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}