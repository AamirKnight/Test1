// src/screens/MeetingScreen.tsx
// Top-level screen — shows LobbyScreen first, then the live meeting room

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useRoomContext,
} from '@livekit/react-native';
import { ConnectionState } from 'livekit-client';
import { LIVEKIT_CONFIG } from '../config/livekit';
import NotificationService from '../services/NotificationService';
import { useBackgroundFilter } from '../hooks/useBackgroundFilter';
import { RoomView } from '../components/RoomView';
import { ControlBar } from '../components/ControlBar';
import { BackgroundFilterPicker } from '../components/BackgroundFilterPicker';
import LobbyScreen, { JoinOptions } from './LobbyScreen';

type AppStage = 'lobby' | 'meeting' | 'ended';

export default function MeetingScreen() {
  const [stage, setStage] = useState<AppStage>('lobby');
  const [joinOptions, setJoinOptions] = useState<JoinOptions>({
    cameraEnabled: true,
    micEnabled: true,
  });

  useEffect(() => {
    if (stage === 'meeting') {
      AudioSession.startAudioSession();
      NotificationService.initialize().then(() =>
        NotificationService.requestPermissions(),
      );
    }
    return () => {
      if (stage === 'meeting') AudioSession.stopAudioSession();
    };
  }, [stage]);

  const handleJoin = useCallback((options: JoinOptions) => {
    setJoinOptions(options);
    setStage('meeting');
  }, []);

  const handleEnded = useCallback(() => {
    setStage('ended');
    NotificationService.stopMeetingTracking();
  }, []);

  if (stage === 'lobby') {
    return (
      <LobbyScreen
        roomName={LIVEKIT_CONFIG.roomName}
        displayName="You"
        onJoin={handleJoin}
      />
    );
  }

  if (stage === 'ended') {
    return (
      <View style={styles.centered}>
        <Text style={styles.endIcon}>👋</Text>
        <Text style={styles.endTitle}>Meeting Ended</Text>
        <Text style={styles.endBody}>You have left the meeting.</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_CONFIG.url}
      token={LIVEKIT_CONFIG.token}
      connect
      audio={joinOptions.micEnabled}
      video={joinOptions.cameraEnabled}
      options={{
        adaptiveStream: { pixelDensity: 'screen' },
        dynacast: true,
      }}
      onConnected={() => NotificationService.startMeetingTracking()}
      onDisconnected={handleEnded}
    >
      <RoomContent onEndCall={handleEnded} />
    </LiveKitRoom>
  );
}

// ── Inner component so it can use LiveKit hooks ───────────────────────────────

function RoomContent({ onEndCall }: { onEndCall: () => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const { activeFilter, isApplying, applyFilter } = useBackgroundFilter();

  const connectionState = room?.state;

  // FIX: Check connecting FIRST, then connected, then disconnected.
  // On initial mount the state is Disconnected briefly before the room
  // transitions to Connecting — we must not treat that as "call ended".
  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;
  const isConnected = connectionState === ConnectionState.Connected;
  const isReconnecting = connectionState === ConnectionState.Reconnecting;

  // Only treat Disconnected as "ended" if we were previously connected.
  // We track this with a ref so it survives re-renders without causing extra renders.
  const hasConnectedRef = React.useRef(false);
  if (isConnected) hasConnectedRef.current = true;

  const handleEndCall = useCallback(() => {
    Alert.alert('End Meeting', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => room?.disconnect() },
    ]);
  }, [room]);

  const handleFilterSelect = useCallback(
    async (type: typeof activeFilter) => {
      await applyFilter(type, localParticipant);
      setShowFilterPicker(false);
    },
    [applyFilter, localParticipant],
  );

  // FIX: Show loader for Connecting OR the initial Disconnected state
  // (before we've ever connected). Never flash "ended" on initial render.
  if (!isConnected) {
    // If we were previously connected and now disconnected → call ended
    if (
      connectionState === ConnectionState.Disconnected &&
      hasConnectedRef.current
    ) {
      return (
        <View style={styles.centered}>
          <Text style={styles.endIcon}>👋</Text>
          <Text style={styles.endTitle}>Meeting Ended</Text>
        </View>
      );
    }

    // Otherwise (connecting, reconnecting, or initial disconnected) → show loader
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loadingText}>
          {isReconnecting ? 'Reconnecting…' : 'Joining meeting…'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.roomContainer}>
      {isReconnecting && (
        <View style={styles.reconnectBanner}>
          <ActivityIndicator size="small" color="#f59e0b" />
          <Text style={styles.reconnectText}>Reconnecting…</Text>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.liveDot} />
          <Text style={styles.headerTitle}>{LIVEKIT_CONFIG.roomName}</Text>
        </View>
        <Text style={styles.headerParticipants}>
          {room?.numParticipants ?? 1} participant
          {(room?.numParticipants ?? 1) !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.videoArea}>
        <RoomView />
      </View>

      <ControlBar
        onEndCall={handleEndCall}
        onToggleBackgroundFilter={() => setShowFilterPicker(true)}
        activeFilter={activeFilter}
        isApplyingFilter={isApplying}
      />

      <BackgroundFilterPicker
        visible={showFilterPicker}
        activeFilter={activeFilter}
        isApplying={isApplying}
        onSelect={handleFilterSelect}
        onClose={() => setShowFilterPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080810',
    gap: 14,
    padding: 32,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '500',
  },
  endIcon: { fontSize: 48 },
  endTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  endBody: { color: '#9ca3af', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  roomContainer: {
    flex: 1,
    backgroundColor: '#080810',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(79,70,229,0.15)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerParticipants: {
    color: '#6b7280',
    fontSize: 13,
  },
  videoArea: { flex: 1 },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,158,11,0.3)',
    paddingVertical: 6,
    gap: 8,
  },
  reconnectText: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
  },
});