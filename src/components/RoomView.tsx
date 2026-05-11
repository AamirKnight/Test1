// src/components/RoomView.tsx
// Renders the participant grid using LiveKit hooks
// - Screen shares get a prominent full-screen pinned layout (Google Meet style)
// - When someone shares screen: their screen fills the main area, cameras go to a bottom strip
// - Multi-participant grid uses ScrollView with fixed tile heights
// - Pinned strip shows thumbnail tiles for all other participants

import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  Dimensions,
  Text,
} from 'react-native';
import {
  useTracks,
  TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track, ParticipantKind } from 'livekit-client';
import { ParticipantTile } from './ParticipantTile';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STRIP_TILE_W = 100;
const STRIP_TILE_H = 120;
const GRID_TILE_W  = (SCREEN_WIDTH - 28) / 2;
const GRID_TILE_H  = 200;

interface RoomViewProps {
  /** Called when a screen share track becomes active so ControlBar can disable share button */
  onScreenShareActive?: (active: boolean) => void;
}

export function RoomView({ onScreenShareActive }: RoomViewProps) {
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);

  // Camera tracks for ALL participants (local + remote)
  const cameraTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
  ]);

  // Screen share tracks for ALL participants (local + remote)
  // withPlaceholder: false — we only want actual active screen shares
  const screenTracks = useTracks([
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  // Notify parent when screen share starts/stops (so ControlBar can disable share)
  React.useEffect(() => {
    onScreenShareActive?.(screenTracks.length > 0);
  }, [screenTracks.length, onScreenShareActive]);

  // When anyone is screen sharing, auto-pin their screen track (first one wins)
  const autoScreenPin: TrackReferenceOrPlaceholder | null =
    screenTracks.length > 0 ? screenTracks[0] : null;

  // Resolve the pinned track
  const pinnedTrack: TrackReferenceOrPlaceholder | null = useMemo(() => {
    if (pinnedIdentity) {
      const fromScreen = screenTracks.find(
        (t) => t.participant.identity === pinnedIdentity,
      );
      if (fromScreen) return fromScreen;
      const fromCamera = cameraTracks.find(
        (t) => t.participant.identity === pinnedIdentity,
      );
      return fromCamera ?? null;
    }
    // Auto-pin any active screen share
    if (autoScreenPin) return autoScreenPin;
    return null;
  }, [pinnedIdentity, screenTracks, cameraTracks, autoScreenPin]);

  // Camera tiles for the strip (shown when pinned layout is active)
  const stripTracks: TrackReferenceOrPlaceholder[] = useMemo(() => {
    if (!pinnedTrack) return [];
    return cameraTracks;
  }, [pinnedTrack, cameraTracks]);

  // Grid tracks (only when nothing is pinned / no screen share)
  const gridTracks: TrackReferenceOrPlaceholder[] = useMemo(() => {
    if (pinnedTrack) return [];
    return cameraTracks;
  }, [pinnedTrack, cameraTracks]);

  const handleTilePress = (identity: string) => {
    setPinnedIdentity((prev) => (prev === identity ? null : identity));
  };

  // ── Google Meet-style pinned layout ──────────────────────────────────────
  // Used when: screen share is active OR user manually pinned a tile
  if (pinnedTrack) {
    const isScreenSharePinned = pinnedTrack.source === Track.Source.ScreenShare;
    const sharerName =
      pinnedTrack.participant.name ?? pinnedTrack.participant.identity ?? 'Someone';

    return (
      <View style={styles.container}>
        {/* Screen share header badge — Google Meet style */}
        {isScreenSharePinned && (
          <View style={styles.shareHeader}>
            <View style={styles.shareDot} />
            <Text style={styles.shareHeaderText}>
              {sharerName} is sharing their screen
            </Text>
          </View>
        )}

        {/* Main pinned area */}
        <View style={styles.pinnedMain}>
          <ParticipantTile
            trackRef={pinnedTrack}
            style={styles.pinnedTile}
            onPress={() => {
              if (pinnedIdentity) setPinnedIdentity(null);
            }}
          />
        </View>

        {/* Camera strip — horizontal scroll at bottom, Google Meet style */}
        {stripTracks.length > 0 && (
          <View style={styles.stripContainer}>
            <FlatList
              data={stripTracks}
              renderItem={({ item }) => (
                <ParticipantTile
                  trackRef={item}
                  style={[
                    styles.stripTile,
                    pinnedIdentity === item.participant.identity &&
                      styles.stripTileActive,
                  ]}
                  onPress={() => handleTilePress(item.participant.identity)}
                />
              )}
              keyExtractor={(item) =>
                `${item.participant.identity}-${item.source}`
              }
              horizontal
              contentContainerStyle={styles.stripContent}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}
      </View>
    );
  }

  // ── Regular camera grid (no screen share, no pin) ─────────────────────────
  const count = gridTracks.length;

  if (count <= 1) {
    return (
      <View style={styles.container}>
        <View style={styles.singleContainer}>
          {gridTracks[0] ? (
            <ParticipantTile
              trackRef={gridTracks[0]}
              style={styles.singleTile}
              onPress={() => handleTilePress(gridTracks[0].participant.identity)}
            />
          ) : null}
        </View>
      </View>
    );
  }

  if (count === 2) {
    return (
      <View style={styles.container}>
        <View style={styles.twoColContainer}>
          {gridTracks.map((track) => (
            <ParticipantTile
              key={`${track.participant.identity}-${track.source}`}
              trackRef={track}
              style={styles.halfTile}
              onPress={() => handleTilePress(track.participant.identity)}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.gridScroll}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gridWrapper}>
          {gridTracks.map((track) => (
            <ParticipantTile
              key={`${track.participant.identity}-${track.source}`}
              trackRef={track}
              style={styles.gridTile}
              onPress={() => handleTilePress(track.participant.identity)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080810',
  },

  // ── Screen share header ──────────────────────────────────────────────────
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,197,94,0.2)',
  },
  shareDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  shareHeaderText: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Pinned layout ──────────────────────────────────────────────────────
  pinnedMain: {
    flex: 1,
    padding: 6,
  },
  pinnedTile: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },

  // ── Camera strip ──────────────────────────────────────────────────────
  stripContainer: {
    height: STRIP_TILE_H + 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(79,70,229,0.2)',
    justifyContent: 'center',
  },
  stripContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  stripTile: {
    width: STRIP_TILE_W,
    height: STRIP_TILE_H,
    borderRadius: 12,
  },
  stripTileActive: {
    borderWidth: 2,
    borderColor: '#4f46e5',
  },

  // ── Single participant ──────────────────────────────────────────────────
  singleContainer: {
    flex: 1,
    padding: 8,
  },
  singleTile: {
    flex: 1,
    borderRadius: 20,
  },

  // ── Two participants ──────────────────────────────────────────────────
  twoColContainer: {
    flex: 1,
    padding: 8,
    gap: 8,
  },
  halfTile: {
    flex: 1,
    borderRadius: 16,
  },

  // ── 3+ grid ──────────────────────────────────────────────────────────
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    padding: 8,
  },
  gridWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  gridTile: {
    width: GRID_TILE_W,
    height: GRID_TILE_H,
    borderRadius: 14,
  },
});