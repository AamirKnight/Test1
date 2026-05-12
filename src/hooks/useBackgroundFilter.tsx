// src/hooks/useBackgroundFilter.tsx
//
// Full background filter integration using @livekit/track-processors
//
// API used:
//   BackgroundProcessor({ mode: 'background-blur', blurRadius: N })
//   BackgroundProcessor({ mode: 'virtual-background', imagePath: '...' })
//   BackgroundProcessor({ mode: 'disabled' })
//   processor.switchTo({ mode, blurRadius?, imagePath? })   ← hot-swap, no re-init
//
// IMPORTANT: We keep ONE BackgroundProcessor alive per camera session.
// Calling switchTo() on it is far cheaper than setProcessor(undefined) + new processor.

import { useState, useCallback, useRef } from 'react';
import { Track } from 'livekit-client';

// ─── Filter Types ──────────────────────────────────────────────────────────────

export type BackgroundFilterType =
  | 'none'
  | 'blur-light'
  | 'blur-medium'
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
  /** blurRadius for blur modes; imagePath for virtual-background modes */
  blurRadius?: number;
  imagePath?: string;
}

// Virtual background images — free-to-use URLs (Unsplash source API)
// In production, host these yourself for reliability.
const VBG_IMAGES: Record<string, string> = {
  'vbg-office':
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=80',
  'vbg-forest':
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1280&q=80',
  'vbg-beach':
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1280&q=80',
  'vbg-mountains':
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1280&q=80',
  'vbg-citynight':
    'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1280&q=80',
  'vbg-coffeeshop':
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1280&q=80',
  'vbg-library':
    'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1280&q=80',
  'vbg-space':
    'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1280&q=80',
};

export const BACKGROUND_FILTERS: BackgroundFilter[] = [
  // ── None ──────────────────────────────────────────────────────────────────
  { type: 'none', label: 'Off', icon: '🚫', category: 'none' },

  // ── Blur levels ───────────────────────────────────────────────────────────
  { type: 'blur-light',  label: 'Light Blur',  icon: '🌫️',  category: 'blur', blurRadius: 8  },
  { type: 'blur-medium', label: 'Medium Blur', icon: '🌁',  category: 'blur', blurRadius: 16 },
  { type: 'blur-full',   label: 'Full Blur',   icon: '💨',  category: 'blur', blurRadius: 28 },

  // ── Virtual backgrounds ───────────────────────────────────────────────────
  {
    type: 'vbg-office',
    label: 'Office',
    icon: '🏢',
    category: 'virtual',
    imagePath: VBG_IMAGES['vbg-office'],
  },
  {
    type: 'vbg-forest',
    label: 'Forest',
    icon: '🌲',
    category: 'virtual',
    imagePath: VBG_IMAGES['vbg-forest'],
  },
  {
    type: 'vbg-beach',
    label: 'Beach',
    icon: '🏖️',
    category: 'virtual',
    imagePath: VBG_IMAGES['vbg-beach'],
  },
  {
    type: 'vbg-mountains',
    label: 'Mountains',
    icon: '⛰️',
    category: 'virtual',
    imagePath: VBG_IMAGES['vbg-mountains'],
  },
  {
    type: 'vbg-citynight',
    label: 'City Night',
    icon: '🌃',
    category: 'virtual',
    imagePath: VBG_IMAGES['vbg-citynight'],
  },
  {
    type: 'vbg-coffeeshop',
    label: 'Café',
    icon: '☕',
    category: 'virtual',
    imagePath: VBG_IMAGES['vbg-coffeeshop'],
  },
  {
    type: 'vbg-library',
    label: 'Library',
    icon: '📚',
    category: 'virtual',
    imagePath: VBG_IMAGES['vbg-library'],
  },
  {
    type: 'vbg-space',
    label: 'Space',
    icon: '🚀',
    category: 'virtual',
    imagePath: VBG_IMAGES['vbg-space'],
  },
];

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useBackgroundFilter() {
  const [activeFilter, setActiveFilter] = useState<BackgroundFilterType>('none');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep one processor alive — avoids re-init cost on every switch
  const processorRef = useRef<any>(null);

  const applyFilter = useCallback(
    async (type: BackgroundFilterType, localParticipant?: any) => {
      if (!localParticipant) return;

      setIsApplying(true);
      setError(null);

      try {
        // Resolve camera publication
        const cameraPub = localParticipant.getTrackPublication(Track.Source.Camera);
        if (!cameraPub?.track) {
          console.warn('[useBackgroundFilter] No camera track found');
          return;
        }

        // Try to import BackgroundProcessor from @livekit/track-processors
        let BackgroundProcessor: any;
        let supportsBackgroundProcessors: (() => boolean) | undefined;

        try {
          const mod = await import('@livekit/track-processors' as any);
          BackgroundProcessor = mod.BackgroundProcessor;
          supportsBackgroundProcessors = mod.supportsBackgroundProcessors;
        } catch {
          setError('@livekit/track-processors is not installed.\nRun: yarn add @livekit/track-processors');
          console.warn('[useBackgroundFilter] @livekit/track-processors not found');
          return;
        }

        // Check device/browser support
        if (supportsBackgroundProcessors && !supportsBackgroundProcessors()) {
          setError('Background filters are not supported on this device.');
          console.warn('[useBackgroundFilter] Background processors not supported');
          return;
        }

        const filterDef = BACKGROUND_FILTERS.find((f) => f.type === type);

        if (type === 'none') {
          // ── Disable: switch to disabled mode if processor exists, else stop ──
          if (processorRef.current) {
            await processorRef.current.switchTo({ mode: 'disabled' });
          } else {
            await cameraPub.track.stopProcessor?.();
          }
          setActiveFilter('none');
          return;
        }

        if (!filterDef) return;

        // ── Build the new mode config ────────────────────────────────────────
        let modeConfig: Record<string, any>;

        if (filterDef.category === 'blur') {
          modeConfig = {
            mode: 'background-blur',
            blurRadius: filterDef.blurRadius,
          };
        } else {
          // virtual background
          modeConfig = {
            mode: 'virtual-background',
            imagePath: filterDef.imagePath,
          };
        }

        if (processorRef.current) {
          // ── Processor already attached — hot-swap mode (cheapest path) ──────
          await processorRef.current.switchTo(modeConfig);
        } else {
          // ── First time — create & attach processor ───────────────────────────
          const processor = BackgroundProcessor(modeConfig);
          processorRef.current = processor;
          await cameraPub.track.setProcessor(processor);
        }

        setActiveFilter(type);
      } catch (e: any) {
        console.warn('[useBackgroundFilter] applyFilter failed:', e);
        setError('Failed to apply filter. Please try again.');
      } finally {
        setIsApplying(false);
      }
    },
    [],
  );

  /** Call this when the camera track is destroyed (e.g. room disconnect) */
  const cleanupProcessor = useCallback(async (localParticipant?: any) => {
    if (!processorRef.current) return;
    try {
      const cameraPub = localParticipant?.getTrackPublication(Track.Source.Camera);
      if (cameraPub?.track) {
        await cameraPub.track.stopProcessor?.();
      }
    } catch {}
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