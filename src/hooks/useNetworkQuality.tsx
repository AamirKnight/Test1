// src/hooks/useNetworkQuality.ts
// Monitors connection quality for low-internet adaptations

import { useState, useEffect } from 'react';
import { useRoomContext } from '@livekit/react-native';
import { ConnectionQuality, RoomEvent } from 'livekit-client';

export type QualityLevel = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

function qualityToLevel(q: ConnectionQuality): QualityLevel {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 'excellent';
    case ConnectionQuality.Good:
      return 'good';
    case ConnectionQuality.Poor:
      return 'poor';
    case ConnectionQuality.Lost:
      return 'lost';
    default:
      return 'unknown';
  }
}

export function useNetworkQuality() {
  const room = useRoomContext();
  const [quality, setQuality] = useState<QualityLevel>('unknown');

  useEffect(() => {
    if (!room) return;

    const handleQualityChange = (q: ConnectionQuality) => {
      setQuality(qualityToLevel(q));
    };

    room.localParticipant.on(
      RoomEvent.ConnectionQualityChanged,
      handleQualityChange,
    );

    // Set initial quality
    setQuality(
      qualityToLevel(room.localParticipant.connectionQuality),
    );

    return () => {
      room.localParticipant.off(
        RoomEvent.ConnectionQualityChanged,
        handleQualityChange,
      );
    };
  }, [room]);

  const qualityColor = {
    excellent: '#22c55e',
    good: '#86efac',
    poor: '#f59e0b',
    lost: '#ef4444',
    unknown: '#6b7280',
  }[quality];

  const qualityBars = {
    excellent: 4,
    good: 3,
    poor: 2,
    lost: 1,
    unknown: 0,
  }[quality];

  return { quality, qualityColor, qualityBars };
}