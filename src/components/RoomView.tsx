// src/components/RoomView.tsx
// Renders the participant grid using LiveKit hooks

import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  ListRenderItem,
} from 'react-native';
import {
  useTracks,
  useLocalParticipant,
  TrackReferenceOrPlaceholder,
  isTrackReference,
  VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { ParticipantTile } from './ParticipantTile';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function RoomView() {
  const { localParticipant } = useLocalParticipant();
  const [pinnedIdentity, setPinnedIdentity] = useState<string | null>(null);

  // Get all camera tracks (includes screen shares)
  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenTracks = useTracks([Track.Source.ScreenShare]);

  const allTracks: TrackReferenceOrPlaceholder[] = useMemo(() => {
    // Prioritize screen shares, then cameras
    return [...screenTracks, ...cameraTracks];
  }, [cameraTracks, screenTracks]);

  const pinnedTrack = useMemo(() => {
    if (!pinnedIdentity) return null;
    return allTracks.find(
      (t) => t.participant.identity === pinnedIdentity,
    ) ?? null;
  }, [allTracks, pinnedIdentity]);

  const otherTracks = useMemo(() => {
    if (!pinnedIdentity) return allTracks;
    return allTracks.filter(
      (t) => t.participant.identity !== pinnedIdentity,
    );
  }, [allTracks, pinnedIdentity]);

  const tileSize = useMemo(() => {
    const count = allTracks.length;
    if (count <= 1) return { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.72 };
    if (count === 2)
      return { width: SCREEN_WIDTH, height: (SCREEN_HEIGHT * 0.72) / 2 - 6 };
    return {
      width: SCREEN_WIDTH / 2 - 18,
      height: (SCREEN_HEIGHT * 0.72) / Math.ceil(count / 2) - 8,
    };
  }, [allTracks.length]);

  const renderTrack: ListRenderItem<TrackReferenceOrPlaceholder> = ({
    item,
  }) => (
    <ParticipantTile
      trackRef={item}
      style={[
        styles.tile,
        pinnedIdentity
          ? styles.tileSmall
          : tileSize,
      ]}
      onPress={() => {
        const id = item.participant.identity;
        setPinnedIdentity((prev) => (prev === id ? null : id));
      }}
    />
  );

  // Pinned layout
  if (pinnedTrack) {
    return (
      <View style={styles.pinnedLayout}>
        <ParticipantTile
          trackRef={pinnedTrack}
          style={styles.pinnedMain}
          onPress={() => setPinnedIdentity(null)}
        />
        <FlatList
          data={otherTracks}
          renderItem={renderTrack}
          keyExtractor={(item) =>
            `${item.participant.identity}-${item.source}`
          }
          horizontal
          style={styles.stripList}
          contentContainerStyle={styles.stripContent}
          showsHorizontalScrollIndicator={false}
        />
      </View>
    );
  }

  // Grid layout
  return (
    <FlatList
      data={allTracks}
      renderItem={renderTrack}
      keyExtractor={(item) => `${item.participant.identity}-${item.source}`}
      numColumns={allTracks.length > 1 ? 2 : 1}
      key={allTracks.length > 1 ? 'grid' : 'single'}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    padding: 8,
    gap: 8,
  },
  tile: {
    margin: 4,
  },
  tileSmall: {
    width: 100,
    height: 130,
    margin: 4,
  },
  pinnedLayout: {
    flex: 1,
  },
  pinnedMain: {
    flex: 1,
    margin: 8,
    borderRadius: 20,
  },
  stripList: {
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  stripContent: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
  },
});