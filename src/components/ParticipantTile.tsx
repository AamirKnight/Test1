// src/components/ParticipantTile.tsx
// Renders a single participant's video/audio tile
// - Camera tracks: objectFit="cover" (fills the tile)
// - Screen share tracks: objectFit="contain" (full screen visible, no crop)

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {
  VideoTrack,
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track } from 'livekit-client';

interface ParticipantTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  style?: object;
  onPress?: () => void;
}

export function ParticipantTile({ trackRef, style, onPress }: ParticipantTileProps) {
  const participant = trackRef.participant;
  const isVideoOn = isTrackReference(trackRef) && !trackRef.publication?.isMuted;
  const isMicMuted = participant.isMicrophoneEnabled === false;
  const isLocal = participant.isLocal;
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;

  const initials = useMemo(() => {
    const name = participant.name ?? participant.identity ?? '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }, [participant.name, participant.identity]);

  return (
    <TouchableOpacity
      style={[styles.tile, isScreenShare && styles.tileScreenShare, style]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {isVideoOn && isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef}
          style={styles.video}
          // Screen shares use "contain" so the full screen is always visible
          // Camera tiles use "cover" to fill the tile nicely
          objectFit={isScreenShare ? 'contain' : 'cover'}
          mirror={isLocal && !isScreenShare && trackRef.source === Track.Source.Camera}
        />
      ) : (
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>
      )}

      {/* Screen share label badge */}
      {isScreenShare && (
        <View style={styles.screenShareBadge}>
          <Text style={styles.screenShareText}>🖥️ Screen</Text>
        </View>
      )}

      {/* Name badge — hide for screen share tiles to save space */}
      {!isScreenShare && (
        <View style={styles.nameBadge}>
          {isMicMuted && <Text style={styles.muteIcon}>🔇</Text>}
          <Text style={styles.nameText} numberOfLines={1}>
            {participant.name ?? participant.identity}
            {isLocal ? ' (You)' : ''}
          </Text>
        </View>
      )}

      {/* Camera off indicator */}
      {!isVideoOn && !isScreenShare && (
        <View style={styles.cameraOffBadge}>
          <Text style={styles.cameraOffIcon}>📷</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.3)',
    position: 'relative',
  },
  tileScreenShare: {
    backgroundColor: '#0d0d1a',
    borderColor: 'rgba(34, 197, 94, 0.5)', // green border for screen share
  },
  video: {
    flex: 1,
  },
  avatarContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16213e',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  nameBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    maxWidth: '85%',
  },
  nameText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  muteIcon: {
    fontSize: 11,
  },
  screenShareBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(34,197,94,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.5)',
  },
  screenShareText: {
    color: '#86efac',
    fontSize: 11,
    fontWeight: '700',
  },
  cameraOffBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraOffIcon: {
    fontSize: 14,
  },
});