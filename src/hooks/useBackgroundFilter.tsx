// src/hooks/useBackgroundFilter.ts
// Background blur/filter state management
// Actual blur is applied via BackgroundBlur processor from livekit-client

import { useState, useCallback } from 'react';

export type BackgroundFilterType = 'none' | 'blur' | 'blur-strong' | 'bokeh';

export interface BackgroundFilter {
  type: BackgroundFilterType;
  label: string;
  icon: string;
}

export const BACKGROUND_FILTERS: BackgroundFilter[] = [
  { type: 'none', label: 'None', icon: '🚫' },
  { type: 'blur', label: 'Soft Blur', icon: '🌫️' },
  { type: 'blur-strong', label: 'Strong Blur', icon: '🌁' },
  { type: 'bokeh', label: 'Bokeh', icon: '✨' },
];

export function useBackgroundFilter() {
  const [activeFilter, setActiveFilter] = useState<BackgroundFilterType>('none');
  const [isApplying, setIsApplying] = useState(false);

  const applyFilter = useCallback(
    async (type: BackgroundFilterType, localParticipant?: any) => {
      if (!localParticipant) return;
      setIsApplying(true);

      try {
        // Get camera publication
        const cameraPub = localParticipant.getTrackPublication('camera');
        if (!cameraPub?.track) return;

        if (type === 'none') {
          // Remove any existing processor
          await cameraPub.track.setProcessor(undefined);
        } else {
          // Dynamically import BackgroundBlur — only available in supported environments
          try {
            const { BackgroundBlur } = await import('@livekit/track-processors');
            const blurRadius = type === 'blur-strong' ? 25 : type === 'bokeh' ? 15 : 10;
            const processor = BackgroundBlur(blurRadius);
            await cameraPub.track.setProcessor(processor);
          } catch (e) {
            console.warn(
              'BackgroundBlur processor not available — @livekit/track-processors may not be installed',
              e,
            );
          }
        }

        setActiveFilter(type);
      } catch (e) {
        console.warn('useBackgroundFilter: failed to apply filter', e);
      } finally {
        setIsApplying(false);
      }
    },
    [],
  );

  return { activeFilter, isApplying, applyFilter, filters: BACKGROUND_FILTERS };
}