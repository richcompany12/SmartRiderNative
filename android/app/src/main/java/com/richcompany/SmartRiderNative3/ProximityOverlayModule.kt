package com.richcompany.smartridernative3

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ProximityOverlayModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object { const val NAME = "ProximityOverlayModule" }
    override fun getName(): String = NAME

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

    @ReactMethod
    fun startService(promise: Promise) {
        try {
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

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, ProximityOverlayService::class.java))
            promise.resolve("success")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // 건물 목록과 반경을 서비스에 넘긴다.
    // payloadJson 형식: {"radius":20,"buildings":[{"id","name","memo","lat","lng"}, ...]}
    @ReactMethod
    fun setBuildings(payloadJson: String, promise: Promise) {
        try {
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

    @ReactMethod
    fun showToast(payloadJson: String) {
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