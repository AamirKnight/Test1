// src/components/RoomView.tsx
// Renders the participant grid using LiveKit hooks
// - Screen shares get a prominent pinned layout automatically
// - Multi-participant grid uses ScrollView with fixed tile heights (no broken dynamic sizing)
// - Pinned strip shows thumbnail tiles for all other participants

import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  Dimensions,
  ListRenderItem,
} from 'react-native';
import {
  useTracks,
  useLocalParticipant,
  TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { ParticipantTile } from './ParticipantTile';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Fixed tile dimensions — avoids the broken dynamic sizing bug
const TILE_HEIGHT_FULL = SCREEN_HEIGHT * 0.70;   // 1 participant
const TILE_HEIGHT_HALF = SCREEN_HEIGHT * 0.33;   // 2 participants, full width
const TILE_HEIGHT_GRID = 200;                     // 3+ participants, 2-col grid
const TILE_WIDTH_GRID  = (SCREEN_WIDTH - 28) / 2; // 2-col with padding

export function RoomView() {
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);

  // Camera tracks (all participants)
  const cameraTracks = useTracks([Track.Source.Camera]);
  // Screen share tracks — treated separately, auto-pinned
  const screenTracks = useTracks([Track.Source.ScreenShare]);

  // If anyone is screen sharing, auto-pin that track (first one wins)
  // User can still manually pin a camera tile to override
  const autoScreenPin = screenTracks.length > 0 ? screenTracks[0] : null;

  // All camera tracks for the thumbnail strip / grid
  const allCameraTracks: TrackReferenceOrPlaceholder[] = useMemo(
    () => cameraTracks,
    [cameraTracks],
  );

  // What's shown in the main pinned view
  const pinnedTrack: TrackReferenceOrPlaceholder | null = useMemo(() => {
    if (pinnedIdentity) {
      // Check screen shares first, then cameras
      const fromScreen = screenTracks.find(
        (t) => t.participant.identity === pinnedIdentity,
      );
      if (fromScreen) return fromScreen;
      const fromCamera = cameraTracks.find(
        (t) => t.participant.identity === pinnedIdentity,
      );
      return fromCamera ?? null;
    }
    // Auto-pin screen share when active
    if (autoScreenPin) return autoScreenPin;
    return null;
  }, [pinnedIdentity, screenTracks, cameraTracks, autoScreenPin]);

  // Tracks shown in the strip (all cameras when pinned view is active)
  const stripTracks: TrackReferenceOrPlaceholder[] = useMemo(() => {
    if (!pinnedTrack) return [];
    // Show all cameras in the strip
    return allCameraTracks;
  }, [pinnedTrack, allCameraTracks]);

  // Tracks shown in the main grid (only when nothing is pinned)
  const gridTracks: TrackReferenceOrPlaceholder[] = useMemo(() => {
    if (pinnedTrack) return [];
    return allCameraTracks;
  }, [pinnedTrack, allCameraTracks]);

  const handleTilePress = (identity: string) => {
    setPinnedIdentity((prev) => (prev === identity ? null : identity));
  };

  // ── Pinned layout (screen share active or user pinned a tile) ──
  if (pinnedTrack) {
    return (
      <View style={styles.pinnedLayout}>
        {/* Main pinned tile */}
        <ParticipantTile
          trackRef={pinnedTrack}
          style={styles.pinnedMain}
          onPress={() => {
            // Unpin only if user manually pinned — keep auto screen pin sticky
            if (pinnedIdentity) {
              setPinnedIdentity(null);
            }
          }}
        />

        {/* Horizontal thumbnail strip for camera tiles */}
        {stripTracks.length > 0 && (
          <FlatList
            data={stripTracks}
            renderItem={({ item }) => (
              <ParticipantTile
                trackRef={item}
                style={[
                  styles.stripTile,
                  pinnedIdentity === item.participant.identity && styles.stripTileActive,
                ]}
                onPress={() => handleTilePress(item.participant.identity)}
              />
            )}
            keyExtractor={(item) =>
              `${item.participant.identity}-${item.source}`
            }
            horizontal
            style={styles.stripList}
            contentContainerStyle={styles.stripContent}
            showsHorizontalScrollIndicator={false}
          />
        )}
      </View>
    );
  }

  // ── Grid layout (no pin, no screen share) ──
  const count = gridTracks.length;

  // 1 participant — full screen
  if (count <= 1) {
    return (
      <View style={styles.singleContainer}>
        {gridTracks[0] ? (
          <ParticipantTile
            trackRef={gridTracks[0]}
            style={styles.singleTile}
            onPress={() => handleTilePress(gridTracks[0].participant.identity)}
          />
        ) : null}
      </View>
    );
  }

  // 2 participants — two rows, full width
  if (count === 2) {
    return (
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
    );
  }

  // 3+ participants — scrollable 2-column grid with fixed tile size
  return (
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
  );
}

const styles = StyleSheet.create({
  // ── Single participant ──
  singleContainer: {
    flex: 1,
    padding: 8,
  },
  singleTile: {
    flex: 1,
    borderRadius: 20,
  },

  // ── Two participants ──
  twoColContainer: {
    flex: 1,
    padding: 8,
    gap: 8,
  },
  halfTile: {
    flex: 1,
    borderRadius: 16,
  },

  // ── 3+ grid ──
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
    width: TILE_WIDTH_GRID,
    height: TILE_HEIGHT_GRID,
    borderRadius: 14,
  },

  // ── Pinned layout ──
  pinnedLayout: {
    flex: 1,
  },
  pinnedMain: {
    flex: 1,
    margin: 8,
    borderRadius: 20,
    // Screen share gets object-fit contain so the whole screen is visible
    overflow: 'hidden',
  },
  stripList: {
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(79,70,229,0.2)',
  },
  stripContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  stripTile: {
    width: 90,
    height: 104,
    borderRadius: 12,
  },
  stripTileActive: {
    borderWidth: 2,
    borderColor: '#4f46e5',
  },
});