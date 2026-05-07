package com.myapp

import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import com.oney.WebRTCModule.WebRTCModuleOptions

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {

    // Initialize the WebRTC module options
    val options = WebRTCModuleOptions.getInstance()
    options.enableMediaProjectionService = true

    super.onCreate(savedInstanceState)
  }

  /**
   * Returns the name of the main component registered from JavaScript.
   */
  override fun getMainComponentName(): String = "MyApp"

  /**
   * New Architecture support
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}