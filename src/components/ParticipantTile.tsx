// src/components/ParticipantTile.tsx
// Renders a single participant's video/audio tile

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
      style={[styles.tile, style]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {isVideoOn && isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef}
          style={styles.video}
          objectFit="cover"
          mirror={isLocal && trackRef.source === Track.Source.Camera}
        />
      ) : (
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>
      )}

      {/* Name badge */}
      <View style={styles.nameBadge}>
        {isMicMuted && <Text style={styles.muteIcon}>🔇</Text>}
        <Text style={styles.nameText} numberOfLines={1}>
          {participant.name ?? participant.identity}
          {isLocal ? ' (You)' : ''}
        </Text>
      </View>

      {/* Camera off overlay indicator */}
      {!isVideoOn && (
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
  video: {
    flex: 1,
    borderRadius: 16,
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