package com.myapp

import android.app.Application
import android.media.AudioAttributes

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

import com.livekit.reactnative.LiveKitReactNative
import com.livekit.reactnative.audio.AudioType

import com.oney.WebRTCModule.WebRTCModuleOptions
import org.webrtc.audio.JavaAudioDeviceModule

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Add any manually linked packages here
        },
    )
  }

  override fun onCreate() {
    super.onCreate()

    // ── LiveKit: must be first, before React Native initialises ──
    // CommunicationAudioType enables echo cancellation & voice processing
    LiveKitReactNative.setup(this, AudioType.CommunicationAudioType())

    // ── WebRTC audio device module (optional fine-tuning) ──
    val options = WebRTCModuleOptions.getInstance()
    options.enableMediaProjectionService = true  // Required for screen share on Android

    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()

    options.audioDeviceModule =
      JavaAudioDeviceModule.builder(this)
        .setAudioAttributes(audioAttributes)
        .createAudioDeviceModule()

    loadReactNative(this)
  }
}