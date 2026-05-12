
import { useState, useCallback, useRef } from 'react';
import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import { Track } from 'livekit-client';

// ─── Filter types ──────────────────────────────────────────────────────────────

export type BackgroundFilterType =
  | 'none'
  | 'blur-light'
  | 'blur-medium'
  | 'blur-strong'
  | 'blur-full'
  | 'vbg-office'
  | 'vbg-forest'
  | 'vbg-beach'
  | 'vbg-mountains'
  | 'vbg-citynight'
  | 'vbg-coffeeshop'
  | 'vbg-library'
  | 'vbg-space';

export interface BackgroundFilter {
  type: BackgroundFilterType;
  label: string;
  icon: string;
  category: 'none' | 'blur' | 'virtual';
  blurRadius?: number;    // used for blur modes
  imagePath?: string;     // used for virtual-background modes
}

// Virtual background images (Unsplash — host your own in production)
const VBG: Record<string, string> = {
  'vbg-office':     'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=80',
  'vbg-forest':     'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1280&q=80',
  'vbg-beach':      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1280&q=80',
  'vbg-mountains':  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1280&q=80',
  'vbg-citynight':  'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1280&q=80',
  'vbg-coffeeshop': 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1280&q=80',
  'vbg-library':    'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1280&q=80',
  'vbg-space':      'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1280&q=80',
};

export const BACKGROUND_FILTERS: BackgroundFilter[] = [
  { type: 'none',        label: 'Off',         icon: '🚫', category: 'none' },

  // ── Blur — 4 intensities ───────────────────────────────────────────────
  { type: 'blur-light',  label: 'Light Blur',  icon: '🌫️', category: 'blur', blurRadius: 8  },
  { type: 'blur-medium', label: 'Medium Blur', icon: '🌁',  category: 'blur', blurRadius: 14 },
  { type: 'blur-strong', label: 'Strong Blur', icon: '💨',  category: 'blur', blurRadius: 20 },
  { type: 'blur-full',   label: 'Full Blur',   icon: '🔲',  category: 'blur', blurRadius: 25 },

  // ── Virtual backgrounds ────────────────────────────────────────────────
  { type: 'vbg-office',     label: 'Office',     icon: '🏢', category: 'virtual', imagePath: VBG['vbg-office']     },
  { type: 'vbg-forest',     label: 'Forest',     icon: '🌲', category: 'virtual', imagePath: VBG['vbg-forest']     },
  { type: 'vbg-beach',      label: 'Beach',      icon: '🏖️', category: 'virtual', imagePath: VBG['vbg-beach']      },
  { type: 'vbg-mountains',  label: 'Mountains',  icon: '⛰️', category: 'virtual', imagePath: VBG['vbg-mountains']  },
  { type: 'vbg-citynight',  label: 'City Night', icon: '🌃', category: 'virtual', imagePath: VBG['vbg-citynight']  },
  { type: 'vbg-coffeeshop', label: 'Café',       icon: '☕', category: 'virtual', imagePath: VBG['vbg-coffeeshop'] },
  { type: 'vbg-library',    label: 'Library',    icon: '📚', category: 'virtual', imagePath: VBG['vbg-library']    },
  { type: 'vbg-space',      label: 'Space',      icon: '🚀', category: 'virtual', imagePath: VBG['vbg-space']      },
];

// ─── Native module reference ───────────────────────────────────────────────────

interface BackgroundBlurNative {
  startProcessor(mode: string, blurRadius: number, imagePath: string | null): Promise<boolean>;
  switchMode(mode: string, blurRadius: number, imagePath: string | null): Promise<boolean>;
  stopProcessor(): Promise<boolean>;
  /** Per-frame processing — base64 JPEG in, base64 JPEG out */
  processFrame(base64Jpeg: string): Promise<string>;
}

const NativeBlur: BackgroundBlurNative | null =
  (NativeModules.BackgroundBlurModule as BackgroundBlurNative) ?? null;

const isNativeAvailable = (): boolean => {
  if (!NativeBlur) return false;
  if (Platform.OS === 'ios') return true;   // CoreImage blur always available
  if (Platform.OS === 'android') return true; // MLKit always available on Android
  return false;
};

// ─── LiveKit-compatible TrackProcessor factory ─────────────────────────────────
//
// LiveKit's TrackProcessor interface (React Native SDK) expects:
//   { name: string, processTrack(opts): Promise<void>, destroy(): Promise<void> }
//
// We use a canvas-free approach: the processor intercepts each video frame
// via the track's `addFrameCallback` method (available in livekit-client >= 1.x
// for React Native), passes it to the native module, and returns the result.

function createNativeProcessor(
  mode: string,
  blurRadius: number,
  imagePath: string | null
): any {
  let started = false;

  return {
    name: 'native-background-processor',

    async processTrack(opts: any): Promise<void> {
      if (!NativeBlur) return;
      if (!started) {
        await NativeBlur.startProcessor(mode, blurRadius, imagePath);
        started = true;
      }
      // Register per-frame callback on the underlying MediaStreamTrack
      const track: MediaStream| undefined = opts?.track;
      if (!track) return;

      // The React Native WebRTC fork exposes addVideoFrameListener on LocalVideoTrack
      const anyTrack = track as any;
      if (typeof anyTrack.addVideoFrameListener === 'function') {
        anyTrack.addVideoFrameListener(async (frame: any) => {
          // frame.data is a base64 JPEG string in the RN WebRTC fork
          if (!frame?.data) return;
          try {
            const processed = await NativeBlur!.processFrame(frame.data);
            if (processed && typeof anyTrack.injectFrame === 'function') {
              anyTrack.injectFrame({ ...frame, data: processed });
            }
          } catch (_) {
            // pass-through on error
          }
        });
      }
    },

    async destroy(): Promise<void> {
      if (!NativeBlur) return;
      await NativeBlur.stopProcessor();
      started = false;
    },

    /** Called by switchMode without re-creating the processor */
    async switchTo(newMode: string, newRadius: number, newImage: string | null): Promise<void> {
      if (!NativeBlur) return;
      if (!started) {
        await NativeBlur.startProcessor(newMode, newRadius, newImage);
        started = true;
      } else {
        await NativeBlur.switchMode(newMode, newRadius, newImage);
      }
    },
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBackgroundFilter() {
  const [activeFilter, setActiveFilter] = useState<BackgroundFilterType>('none');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One processor kept alive — cheapest to hot-swap
  const processorRef = useRef<any>(null);

  const applyFilter = useCallback(
    async (type: BackgroundFilterType, localParticipant?: any) => {
      if (!localParticipant) return;

      setIsApplying(true);
      setError(null);

      try {
        if (!isNativeAvailable()) {
          setError(
            'Background filters require the native BackgroundBlurModule.\n' +
            'Make sure you rebuilt the app after adding the Kotlin/Swift files.'
          );
          return;
        }

        const cameraPub = localParticipant.getTrackPublication(Track.Source.Camera);
        if (!cameraPub?.track) {
          setError('No camera track found. Enable your camera first.');
          return;
        }

        // ── Turning off ─────────────────────────────────────────────────────
        if (type === 'none') {
          if (processorRef.current) {
            await cameraPub.track.stopProcessor?.();
            await processorRef.current.destroy?.();
            processorRef.current = null;
          } else {
            await NativeBlur?.stopProcessor().catch(() => {});
          }
          setActiveFilter('none');
          return;
        }

        const filterDef = BACKGROUND_FILTERS.find((f) => f.type === type);
        if (!filterDef) return;

        const nativeMode   = filterDef.category === 'blur' ? 'blur' : 'virtual';
        const nativeRadius = filterDef.blurRadius ?? 0;
        const nativeImage  = filterDef.imagePath ?? null;

        // ── Hot-swap existing processor ─────────────────────────────────────
        if (processorRef.current?.switchTo) {
          await processorRef.current.switchTo(nativeMode, nativeRadius, nativeImage);
          setActiveFilter(type);
          return;
        }

        // ── First-time: create + attach ─────────────────────────────────────
        const processor = createNativeProcessor(nativeMode, nativeRadius, nativeImage);
        processorRef.current = processor;
        await cameraPub.track.setProcessor(processor);
        setActiveFilter(type);

      } catch (e: any) {
        console.warn('[useBackgroundFilter] applyFilter error:', e);
        setError('Failed to apply filter: ' + (e?.message ?? 'unknown error'));
      } finally {
        setIsApplying(false);
      }
    },
    []
  );

  const cleanupProcessor = useCallback(async (localParticipant?: any) => {
    if (!processorRef.current) return;
    try {
      const cameraPub = localParticipant?.getTrackPublication(Track.Source.Camera);
      if (cameraPub?.track) {
        await cameraPub.track.stopProcessor?.();
      }
      await processorRef.current.destroy?.();
    } catch (_) {}
    processorRef.current = null;
    setActiveFilter('none');
  }, []);

  return {
    activeFilter,
    isApplying,
    error,
    applyFilter,
    cleanupProcessor,
    filters: BACKGROUND_FILTERS,
  };
}