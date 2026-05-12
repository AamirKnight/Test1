package com.myapp.blur

import android.graphics.*
import android.util.Log
import com.facebook.react.bridge.*
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.SegmentationMask
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import org.webrtc.VideoFrame
import org.webrtc.VideoProcessor
import org.webrtc.VideoSink
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.max

class BackgroundBlurModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG    = "BackgroundBlurModule"
        const val NAME   = "BackgroundBlurModule"
        // Singleton so MainApplication can wire it into WebRTCModuleOptions
        val processor    = BlurVideoProcessor()
    }

    override fun getName() = NAME

    @ReactMethod
    fun startProcessor(mode: String, blurRadiusJs: Int, imagePath: String?, promise: Promise) {
        Log.d(TAG, "startProcessor mode=$mode")
        if (mode == "none") {
            processor.setMode("none", 0f, null)
            promise.resolve(true)
            return
        }
        if (mode == "virtual" && imagePath != null) {
            try {
                val bmp = loadBitmap(imagePath)
                processor.setMode(mode, blurRadiusJs.toFloat(), bmp)
            } catch (e: Exception) {
                promise.reject("IMG_LOAD_FAIL", e.message)
                return
            }
        } else {
            processor.setMode(mode, blurRadiusJs.toFloat(), null)
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun switchMode(mode: String, blurRadiusJs: Int, imagePath: String?, promise: Promise) =
        startProcessor(mode, blurRadiusJs, imagePath, promise)

    @ReactMethod
    fun stopProcessor(promise: Promise) {
        processor.setMode("none", 0f, null)
        promise.resolve(true)
    }

    private fun loadBitmap(path: String): Bitmap =
        if (path.startsWith("http")) {
            BitmapFactory.decodeStream(java.net.URL(path).openStream())
                ?: throw Exception("null bitmap from URL")
        } else {
            BitmapFactory.decodeFile(path) ?: throw Exception("null bitmap from file")
        }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        super.invalidate()
        processor.setMode("none", 0f, null)
        processor.close()
    }
}

// ── BlurVideoProcessor ─────────────────────────────────────────────────────────
// Implements WebRTC's VideoProcessor — sits between the camera capturer and the
// encoder. Every frame passes through onFrameCaptured(), we process it, then
// forward to the sink (encoder).

class BlurVideoProcessor : VideoProcessor {

    @Volatile private var mode        = "none"
    @Volatile private var blurRadius  = 15f
    @Volatile private var virtualBmp: Bitmap? = null

    private var sink: VideoSink? = null
    private val busy = AtomicBoolean(false)

    private val segmenter = Segmentation.getClient(
        SelfieSegmenterOptions.Builder()
            .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
            .enableRawSizeMask()
            .build()
    )

    fun setMode(m: String, radius: Float, vbmp: Bitmap?) {
        mode       = m
        blurRadius = radius.coerceIn(1f, 25f)
        if (vbmp != null) virtualBmp = vbmp
    }

    fun close() {
        segmenter.close()
        virtualBmp?.recycle()
        virtualBmp = null
    }

    // Called by WebRTC for every captured frame
    override fun onFrameCaptured(frame: VideoFrame) {
        val currentMode = mode
        val currentSink = sink

        if (currentSink == null) return

        // Pass through if no effect active or already processing (drop frame)
        if (currentMode == "none" || !busy.compareAndSet(false, true)) {
            currentSink.onFrame(frame)
            return
        }

        frame.retain()

        try {
            val bitmap = videoFrameToBitmap(frame) ?: run {
                busy.set(false)
                frame.release()
                currentSink.onFrame(frame)
                return
            }

            val inputImage = InputImage.fromBitmap(bitmap, 0)

            // Tasks.await — safe here because we're already on a background thread
            // (WebRTC calls onFrameCaptured on its capture thread, not main thread)
            val mask = Tasks.await(segmenter.process(inputImage))
            val processed = applyEffect(bitmap, mask, currentMode)
            bitmap.recycle()

            val processedFrame = bitmapToVideoFrame(processed, frame)
            processed.recycle()

            currentSink.onFrame(processedFrame)
            processedFrame.release()

        } catch (e: Exception) {
            Log.w(TAG, "Frame processing error: ${e.message}")
            currentSink.onFrame(frame)
        } finally {
            frame.release()
            busy.set(false)
        }
    }

    override fun onCapturerStarted(success: Boolean) {}
    override fun onCapturerStopped() {}

    override fun setSink(videoSink: VideoSink?) {
        sink = videoSink
    }

    // ── VideoFrame ↔ Bitmap ────────────────────────────────────────────────────

    private fun videoFrameToBitmap(frame: VideoFrame): Bitmap? {
        return try {
            val buffer = frame.buffer
            val i420   = buffer.toI420() ?: return null
            val w      = frame.rotatedWidth
            val h      = frame.rotatedHeight
            val pixels = IntArray(w * h)

            val yBuf = i420.dataY
            val uBuf = i420.dataU
            val vBuf = i420.dataV
            val yStr = i420.strideY
            val uStr = i420.strideU
            val vStr = i420.strideV

            for (row in 0 until h) {
                for (col in 0 until w) {
                    val y = (yBuf.get(row * yStr + col).toInt() and 0xFF)
                    val u = (uBuf.get((row / 2) * uStr + (col / 2)).toInt() and 0xFF) - 128
                    val v = (vBuf.get((row / 2) * vStr + (col / 2)).toInt() and 0xFF) - 128
                    val r = (y + 1.402f   * v).toInt().coerceIn(0, 255)
                    val g = (y - 0.344f   * u - 0.714f * v).toInt().coerceIn(0, 255)
                    val b = (y + 1.772f   * u).toInt().coerceIn(0, 255)
                    pixels[row * w + col] = Color.rgb(r, g, b)
                }
            }

            i420.release()
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bmp.setPixels(pixels, 0, w, 0, 0, w, h)
            bmp
        } catch (e: Exception) {
            Log.e(TAG, "videoFrameToBitmap error", e)
            null
        }
    }

    private fun bitmapToVideoFrame(bitmap: Bitmap, original: VideoFrame): VideoFrame {
        val w      = bitmap.width
        val h      = bitmap.height
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

        val i420   = org.webrtc.JavaI420Buffer.allocate(w, h)
        val yPlane = i420.dataY
        val uPlane = i420.dataU
        val vPlane = i420.dataV

        for (row in 0 until h) {
            for (col in 0 until w) {
                val px = pixels[row * w + col]
                val r  = Color.red(px).toFloat()
                val g  = Color.green(px).toFloat()
                val b  = Color.blue(px).toFloat()
                val y  = ( 0.299f * r + 0.587f * g + 0.114f * b).toInt().coerceIn(0, 255)
                val u  = (-0.169f * r - 0.331f * g + 0.500f * b + 128).toInt().coerceIn(0, 255)
                val v  = ( 0.500f * r - 0.419f * g - 0.081f * b + 128).toInt().coerceIn(0, 255)
                yPlane.put(row * i420.strideY + col, y.toByte())
                if (row % 2 == 0 && col % 2 == 0) {
                    uPlane.put((row / 2) * i420.strideU + (col / 2), u.toByte())
                    vPlane.put((row / 2) * i420.strideV + (col / 2), v.toByte())
                }
            }
        }

        val frame = VideoFrame(i420, original.rotation, original.timestampNs)
        i420.release()
        return frame
    }

    // ── Effect compositing ─────────────────────────────────────────────────────

    private fun applyEffect(frame: Bitmap, mask: SegmentationMask, mode: String): Bitmap {
        val w = frame.width; val h = frame.height
        val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)

        when (mode) {
            "blur" -> {
                val blurred = stackBlur(frame, blurRadius.toInt())
                canvas.drawBitmap(blurred, 0f, 0f, null)
                blurred.recycle()
            }
            "virtual" -> {
                val vbg = virtualBmp
                if (vbg != null) {
                    val scaled = Bitmap.createScaledBitmap(vbg, w, h, true)
                    canvas.drawBitmap(scaled, 0f, 0f, null)
                    if (scaled !== vbg) scaled.recycle()
                } else canvas.drawColor(Color.BLACK)
            }
            else -> canvas.drawColor(Color.BLACK)
        }

        val buf   = mask.buffer
        val mw    = mask.width
        val mh    = mask.height
        val px    = IntArray(w * h)
        frame.getPixels(px, 0, w, 0, 0, w, h)
        val sx    = mw.toFloat() / w
        val sy    = mh.toFloat() / h

        for (y in 0 until h) for (x in 0 until w) {
            val mx    = (x * sx).toInt().coerceIn(0, mw - 1)
            val my    = (y * sy).toInt().coerceIn(0, mh - 1)
            val alpha = (buf.get(my * mw + mx) * 255f).toInt().coerceIn(0, 255)
            val orig  = px[y * w + x]
            px[y * w + x] = Color.argb(alpha, Color.red(orig), Color.green(orig), Color.blue(orig))
        }
        buf.rewind()

        val person = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        person.setPixels(px, 0, w, 0, 0, w, h)
        canvas.drawBitmap(person, 0f, 0f, null)
        person.recycle()
        return result
    }

    private fun stackBlur(src: Bitmap, radius: Int): Bitmap {
        val r  = radius.coerceAtLeast(1)
        val bm = src.copy(Bitmap.Config.ARGB_8888, true)
        val w  = bm.width; val h = bm.height
        val px = IntArray(w * h)
        bm.getPixels(px, 0, w, 0, 0, w, h)
        val ts  = (2 * r + 1) * 256
        val ds  = (r + 1) * (r + 1)
        val mul = IntArray(ts) { it / ds }

        for (y in 0 until h) {
            var rS = 0; var gS = 0; var bS = 0
            for (i in -r..r) {
                val p = px[y * w + min(max(i, 0), w - 1)]; val wt = r + 1 - abs(i)
                rS += Color.red(p)*wt; gS += Color.green(p)*wt; bS += Color.blue(p)*wt
            }
            for (x in 0 until w) {
                px[y*w+x] = Color.rgb(mul[min(rS,ts-1)], mul[min(gS,ts-1)], mul[min(bS,ts-1)])
                val l = px[y*w+max(x-r,0)]; val rr = px[y*w+min(x+r+1,w-1)]
                rS+=Color.red(rr)-Color.red(l); gS+=Color.green(rr)-Color.green(l); bS+=Color.blue(rr)-Color.blue(l)
            }
        }
        for (x in 0 until w) {
            var rS = 0; var gS = 0; var bS = 0
            for (i in -r..r) {
                val p = px[min(max(i,0),h-1)*w+x]; val wt = r+1-abs(i)
                rS+=Color.red(p)*wt; gS+=Color.green(p)*wt; bS+=Color.blue(p)*wt
            }
            for (y in 0 until h) {
                px[y*w+x] = Color.rgb(mul[min(rS,ts-1)], mul[min(gS,ts-1)], mul[min(bS,ts-1)])
                val t = px[max(y-r,0)*w+x]; val b = px[min(y+r+1,h-1)*w+x]
                rS+=Color.red(b)-Color.red(t); gS+=Color.green(b)-Color.green(t); bS+=Color.blue(b)-Color.blue(t)
            }
        }
        bm.setPixels(px, 0, w, 0, 0, w, h)
        return bm
    }
}