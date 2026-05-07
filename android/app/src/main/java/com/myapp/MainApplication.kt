package com.myapp

import android.app.Application
import android.media.AudioAttributes

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

import com.oney.WebRTCModule.WebRTCModuleOptions

import org.webrtc.audio.JavaAudioDeviceModule

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()

    // Configure WebRTC audio module BEFORE React Native initializes
    val options = WebRTCModuleOptions.getInstance()

    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()

    options.audioDeviceModule =
      JavaAudioDeviceModule.builder(this)
        .setAudioAttributes(audioAttributes)
        .createAudioDeviceModule()

    loadReactNative(this)
  }
}