import { useState, useCallback, useRef } from 'react';
import { Platform, NativeModules } from 'react-native';
import { Track } from 'livekit-client';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  blurRadius?: number;
  imagePath?: string;
}

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
  { type: 'none',           label: 'Off',         icon: '🚫', category: 'none' },
  { type: 'blur-light',     label: 'Light Blur',  icon: '🌫️', category: 'blur',    blurRadius: 8  },
  { type: 'blur-medium',    label: 'Medium Blur', icon: '🌁',  category: 'blur',    blurRadius: 14 },
  { type: 'blur-strong',    label: 'Strong Blur', icon: '💨',  category: 'blur',    blurRadius: 20 },
  { type: 'blur-full',      label: 'Full Blur',   icon: '🔲',  category: 'blur',    blurRadius: 25 },
  { type: 'vbg-office',     label: 'Office',      icon: '🏢',  category: 'virtual', imagePath: VBG['vbg-office']     },
  { type: 'vbg-forest',     label: 'Forest',      icon: '🌲',  category: 'virtual', imagePath: VBG['vbg-forest']     },
  { type: 'vbg-beach',      label: 'Beach',       icon: '🏖️', category: 'virtual', imagePath: VBG['vbg-beach']      },
  { type: 'vbg-mountains',  label: 'Mountains',   icon: '⛰️', category: 'virtual', imagePath: VBG['vbg-mountains']  },
  { type: 'vbg-citynight',  label: 'City Night',  icon: '🌃',  category: 'virtual', imagePath: VBG['vbg-citynight']  },
  { type: 'vbg-coffeeshop', label: 'Café',        icon: '☕',  category: 'virtual', imagePath: VBG['vbg-coffeeshop'] },
  { type: 'vbg-library',    label: 'Library',     icon: '📚',  category: 'virtual', imagePath: VBG['vbg-library']    },
  { type: 'vbg-space',      label: 'Space',       icon: '🚀',  category: 'virtual', imagePath: VBG['vbg-space']      },
];

// ─── Native module ────────────────────────────────────────────────────────────

interface BackgroundBlurNative {
  startProcessor(mode: string, blurRadius: number, imagePath: string | null): Promise<boolean>;
  switchMode(mode: string, blurRadius: number, imagePath: string | null): Promise<boolean>;
  stopProcessor(): Promise<boolean>;
}

const NativeBlur = (NativeModules.BackgroundBlurModule as BackgroundBlurNative) ?? null;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBackgroundFilter() {
  const [activeFilter, setActiveFilter] = useState<BackgroundFilterType>('none');
  const [isApplying, setIsApplying]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const processorActive                 = useRef(false);

  const applyFilter = useCallback(async (
    type: BackgroundFilterType,
    localParticipant?: any,
  ) => {
    setIsApplying(true);
    setError(null);

    try {
      // ── Validate native module ───────────────────────────────────────────
      if (!NativeBlur) {
        setError(
          'BackgroundBlurModule not found.\n' +
          'Did you rebuild the app after adding the Kotlin files?'
        );
        return;
      }

      // ── Turning off ──────────────────────────────────────────────────────
      if (type === 'none') {
        if (processorActive.current) {
          await NativeBlur.stopProcessor();
          processorActive.current = false;
        }
        setActiveFilter('none');
        return;
      }

      // ── Validate camera track exists ─────────────────────────────────────
      // We don't actually need the track object — the native side attaches
      // to the WebRTC pipeline directly. We just check it exists so we can
      // give a helpful error if the camera is off.
      if (localParticipant) {
        const cameraPub = localParticipant.getTrackPublication(Track.Source.Camera);
        if (!cameraPub?.track) {
          setError('No camera track found. Please enable your camera first.');
          return;
        }
      }

      const filterDef = BACKGROUND_FILTERS.find((f) => f.type === type)!;
      const nativeMode   = filterDef.category === 'blur' ? 'blur' : 'virtual';
      const nativeRadius = filterDef.blurRadius ?? 0;
      const nativeImage  = filterDef.imagePath  ?? null;

      // ── Hot-swap vs first start ──────────────────────────────────────────
      if (processorActive.current) {
        await NativeBlur.switchMode(nativeMode, nativeRadius, nativeImage);
      } else {
        await NativeBlur.startProcessor(nativeMode, nativeRadius, nativeImage);
        processorActive.current = true;
      }

      setActiveFilter(type);

    } catch (e: any) {
      console.warn('[useBackgroundFilter] error:', e);
      setError('Failed to apply filter: ' + (e?.message ?? String(e)));
    } finally {
      setIsApplying(false);
    }
  }, []);

  const cleanupProcessor = useCallback(async (_localParticipant?: any) => {
    if (!processorActive.current) return;
    try {
      await NativeBlur?.stopProcessor();
    } catch (_) {}
    processorActive.current = false;
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