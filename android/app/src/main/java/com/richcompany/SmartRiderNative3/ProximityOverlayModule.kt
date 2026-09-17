package com.richcompany.smartridernative3

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ProximityOverlayModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ProximityOverlayModule"
        const val TAG = "PROX_KT"
    }
    override fun getName(): String = NAME

    // ────────────────────────────────────────────────────────────
    //  위치 권한이 없으면 서비스에 인텐트를 보내지 않는다.
    //
    //  startForegroundService()로 띄운 서비스는 5초 안에
    //  반드시 startForeground()를 불러야 한다.
    //  위치 권한이 없으면 FGS_TYPE_LOCATION으로 그걸 부를 수 없고,
    //  서비스 안에서 stopSelf()로 조용히 빠져나가도
    //  시스템은 "약속 어김"으로 보고 앱 프로세스를 죽인다.
    //  (ForegroundServiceDidNotStartInTimeException)
    //
    //  따라서 유일한 해법은 애초에 보내지 않는 것이다.
    //  권한 화면을 통과하기 전에는 이 상태가 정상이므로
    //  조용히 물러나고, 권한을 받은 뒤 다시 켜진다.
    // ────────────────────────────────────────────────────────────
    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            reactContext, android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            reactContext, android.Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    // ── 오버레이 권한 (서비스를 켜지 않으므로 권한 검사 없음) ──

    @ReactMethod
    fun hasPermission(promise: Promise) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            Settings.canDrawOverlays(reactContext) else true
        promise.resolve(granted)
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${reactContext.packageName}")
                ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                reactContext.startActivity(intent)
                promise.resolve(false)
                return
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // ── 서비스 제어 ──

    @ReactMethod
    fun startService(promise: Promise) {
        try {
            if (!hasLocationPermission()) {
                android.util.Log.d(TAG, "위치 권한 없음 - 서비스 시작 취소")
                promise.resolve("no_permission")
                return
            }
            val intent = Intent(reactContext, ProximityOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve("success")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // 중지는 권한과 무관하다. 오히려 권한이 없을 때 확실히 꺼야 한다.
    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, ProximityOverlayService::class.java))
            promise.resolve("success")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // ── 데이터 전달 ──

    // 건물 목록과 반경을 서비스에 넘긴다.
    // payloadJson 형식: {"radius":20,"buildings":[{"id","name","memo","lat","lng"}, ...]}
    @ReactMethod
    fun setBuildings(payloadJson: String, promise: Promise) {
        try {
            if (!hasLocationPermission()) {
                android.util.Log.d(TAG, "위치 권한 없음 - 건물 전달 취소")
                promise.resolve("no_permission")
                return
            }
            val intent = Intent(reactContext, ProximityOverlayService::class.java).apply {
                action = ProximityOverlayService.ACTION_SET_BUILDINGS
                putExtra(ProximityOverlayService.EXTRA_PAYLOAD, payloadJson)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve("success")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // 강력 알림 지점을 서비스에 넘긴다.
    // payloadJson 형식: {"enterRadius":100,"exitRadius":200,"points":[{"id","name","type","lat","lng"}, ...]}
    @ReactMethod
    fun setAlertPoints(payloadJson: String, promise: Promise) {
        try {
            if (!hasLocationPermission()) {
                android.util.Log.d(TAG, "위치 권한 없음 - 알림지점 전달 취소")
                promise.resolve("no_permission")
                return
            }
            val intent = Intent(reactContext, ProximityOverlayService::class.java).apply {
                action = ProximityOverlayService.ACTION_SET_ALERTS
                putExtra(ProximityOverlayService.EXTRA_PAYLOAD, payloadJson)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve("success")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // ── 안 보기로 한 지점 ──

    // "안 보기로 한 지점" 전체 해제 (설정 화면에서 호출)
    @ReactMethod
    fun clearAlertMutes(promise: Promise) {
        try {
            if (!hasLocationPermission()) {
                promise.resolve("no_permission")
                return
            }
            send(ProximityOverlayService.ACTION_CLEAR_MUTES)
            promise.resolve("success")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // 안 보기로 한 지점이 몇 곳인지 물어본다.
    // 답은 ProximityMuteCount 이벤트로 돌아온다.
    // ⚠️ 설정 화면이 열릴 때마다 호출된다. 권한 없을 때 여기서 앱이 죽었었다.
    @ReactMethod
    fun requestMuteCount(promise: Promise) {
        try {
            if (!hasLocationPermission()) {
                promise.resolve("no_permission")
                return
            }
            send(ProximityOverlayService.ACTION_REQUEST_MUTE_COUNT)
            promise.resolve("success")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // 마지막 안전망. 호출부에서 놓쳐도 여기서 한 번 더 막는다.
    private fun send(action: String) {
        if (!hasLocationPermission()) {
            android.util.Log.d(TAG, "위치 권한 없음 - 인텐트 전송 취소: $action")
            return
        }
        val intent = Intent(reactContext, ProximityOverlayService::class.java).apply {
            this.action = action
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    // ── 플로팅 버튼 / 토스트 ──

    // 플로팅 버튼 켜기/끄기 (설정 화면 스위치에서 호출)
    @ReactMethod
    fun setFloatingButton(enabled: Boolean, promise: Promise) {
        try {
            if (!hasLocationPermission()) {
                android.util.Log.d(TAG, "위치 권한 없음 - 플로팅 설정 취소")
                promise.resolve("no_permission")
                return
            }
            val intent = Intent(reactContext, ProximityOverlayService::class.java).apply {
                action = ProximityOverlayService.ACTION_SET_FLOATING
                putExtra(ProximityOverlayService.EXTRA_ENABLED, enabled)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve("success")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun showToast(payloadJson: String) {
        if (!hasLocationPermission()) return
        try {
            val intent = Intent(reactContext, ProximityOverlayService::class.java).apply {
                action = ProximityOverlayService.ACTION_SHOW_TOAST
                putExtra(ProximityOverlayService.EXTRA_PAYLOAD, payloadJson)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
        } catch (e: Exception) {
            try {
                val b = Intent(ProximityOverlayService.ACTION_SHOW_TOAST).apply {
                    putExtra(ProximityOverlayService.EXTRA_PAYLOAD, payloadJson)
                    setPackage(reactContext.packageName)
                }
                reactContext.sendBroadcast(b)
            } catch (e2: Exception) { e2.printStackTrace() }
        }
    }
}