// android/app/src/main/java/com/myapp/blur/BlurCapturerFactory.kt

package com.myapp.blur

import android.content.Context
import android.util.Log
import org.webrtc.*
import com.oney.WebRTCModule.VideoCapturerFactory

private const val TAG = "BlurCapturerFactory"

class BlurCapturerFactory(private val context: Context) : VideoCapturerFactory {

    override fun createVideoCapturer(
        deviceId: String?,
        position: String?,
        eventsHandler: com.oney.WebRTCModule.VideoCapturerEventsHandler?,
    ): VideoCapturer? {
        val enumerator: CameraEnumerator =
            if (Camera2Enumerator.isSupported(context)) Camera2Enumerator(context)
            else Camera1Enumerator(true)

        val deviceNames = enumerator.deviceNames
        val target = when (position) {
            "front" -> deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            "back"  -> deviceNames.firstOrNull { enumerator.isBackFacing(it) }
            else    -> deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
                       ?: deviceNames.firstOrNull()
        } ?: deviceNames.firstOrNull() ?: return null

        Log.d(TAG, "Creating capturer for: $target")

        val capturer = if (Camera2Enumerator.isSupported(context)) {
            Camera2Capturer(context, target, null)
        } else {
            Camera1Capturer(target, null, false)
        }

        // Wrap it in a ProcessingCapturer that routes frames through BlurVideoProcessor
        return ProcessingCapturer(capturer, BackgroundBlurModule.processor)
    }
}

/**
 * Wraps any VideoCapturer and routes every frame through a VideoProcessor
 * before delivering it to the downstream VideoSink (encoder).
 */
class ProcessingCapturer(
    private val inner: VideoCapturer,
    private val processor: BlurVideoProcessor,
) : VideoCapturer {

    private var capturerObserver: CapturerObserver? = null

    // This observer sits between the inner capturer and the processor
    private val interceptingObserver = object : CapturerObserver {
        override fun onCapturerStarted(success: Boolean) {
            processor.onCapturerStarted(success)
            capturerObserver?.onCapturerStarted(success)
        }
        override fun onCapturerStopped() {
            processor.onCapturerStopped()
            capturerObserver?.onCapturerStopped()
        }
        override fun onFrameCaptured(frame: VideoFrame) {
            // Route every frame through the blur processor.
            // The processor will call its sink (set below) when done.
            processor.onFrameCaptured(frame)
        }
    }

    override fun initialize(
        surfaceTextureHelper: SurfaceTextureHelper?,
        context: android.content.Context?,
        observer: CapturerObserver?,
    ) {
        capturerObserver = observer
        // Tell the processor to forward processed frames to the real observer
        processor.setSink(VideoSink { frame -> capturerObserver?.onFrameCaptured(frame) })
        inner.initialize(surfaceTextureHelper, context, interceptingObserver)
    }

    override fun startCapture(width: Int, height: Int, framerate: Int) =
        inner.startCapture(width, height, framerate)

    override fun stopCapture() = inner.stopCapture()
    override fun changeCaptureFormat(width: Int, height: Int, framerate: Int) =
        inner.changeCaptureFormat(width, height, framerate)
    override fun dispose() = inner.dispose()
    override fun isScreencast(): Boolean = inner.isScreencast()
}