// src/screens/MeetingScreen.tsx
// Top-level screen — shows LobbyScreen first, then the live meeting room
//
// FIXES:
// 1. Back button → Picture-in-Picture (Android) instead of leaving room
// 2. Reconnect: use room events (not polling state) to drive connected/loading UI
// 3. Screen share: threads `remoteScreenShareActive` from RoomView → ControlBar
// 4. Screen share layout: Google Meet style via updated RoomView

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
  NativeEventSubscription,
  Platform,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useRoomContext,
} from '@livekit/react-native';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { LIVEKIT_CONFIG } from '../config/livekit';
import NotificationService from '../services/NotificationService';
import { useBackgroundFilter } from '../hooks/useBackgroundFilter';
import { RoomView } from '../components/RoomView';
import { ControlBar } from '../components/ControlBar';
import { BackgroundFilterPicker } from '../components/BackgroundFilterPicker';
import LobbyScreen, { JoinOptions } from './LobbyScreen';

// PiP helper — Android only. Silently no-ops on iOS.
// We use NativeModules so the import works even if the module isn't linked.
let PictureInPicture: { enterPictureInPictureMode?: () => void } = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NativeModules } = require('react-native');
  PictureInPicture = NativeModules.RNAndroidPip ?? {};
} catch (_) {}

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

  // ── Android back button → PiP instead of leaving ──────────────────────────
  useEffect(() => {
    if (stage !== 'meeting') return;

    const sub: NativeEventSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (Platform.OS === 'android') {
          // Try to enter PiP mode. Falls back to minimise app if PiP not available.
          if (PictureInPicture.enterPictureInPictureMode) {
            PictureInPicture.enterPictureInPictureMode();
          } else {
            // Minimise the app without leaving the room
            BackHandler.exitApp();
          }
          return true; // Prevent default back behaviour (closing the screen/room)
        }
        return false; // iOS: let the system handle it
      },
    );

    return () => sub.remove();
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
  const [remoteScreenShareActive, setRemoteScreenShareActive] = useState(false);
  const { activeFilter, isApplying, applyFilter } = useBackgroundFilter();

  // ── FIX: Use event-driven connection state instead of polling room.state ──
  // The bug: on reconnect, room.state briefly shows Disconnected before
  // transitioning to Connecting, causing the UI to flash "ended" or
  // others to see you while you see a loader forever.
  //
  // Solution: track connection state via RoomEvents so we never miss
  // the transition, and only mark "ended" after we've been truly Connected.
  const [connState, setConnState] = useState<ConnectionState>(
    room?.state ?? ConnectionState.Connecting,
  );
  const hasEverConnected = useRef(false);

  useEffect(() => {
    if (!room) return;

    const onConnected    = () => { hasEverConnected.current = true; setConnState(ConnectionState.Connected);     };
    const onReconnecting = () => setConnState(ConnectionState.Reconnecting);
    const onReconnected  = () => setConnState(ConnectionState.Connected);
    const onDisconnected = () => setConnState(ConnectionState.Disconnected);

    room.on(RoomEvent.Connected,     onConnected);
    room.on(RoomEvent.Reconnecting,  onReconnecting);
    room.on(RoomEvent.Reconnected,   onReconnected);
    room.on(RoomEvent.Disconnected,  onDisconnected);

    // Sync immediately in case we're already connected when this mounts
    if (room.state === ConnectionState.Connected) {
      hasEverConnected.current = true;
      setConnState(ConnectionState.Connected);
    }

    return () => {
      room.off(RoomEvent.Connected,     onConnected);
      room.off(RoomEvent.Reconnecting,  onReconnecting);
      room.off(RoomEvent.Reconnected,   onReconnected);
      room.off(RoomEvent.Disconnected,  onDisconnected);
    };
  }, [room]);

  const isConnected    = connState === ConnectionState.Connected;
  const isReconnecting = connState === ConnectionState.Reconnecting;

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

  // ── Show loader while connecting / reconnecting ───────────────────────────
  if (!isConnected) {
    // If truly disconnected after being connected → call ended
    if (
      connState === ConnectionState.Disconnected &&
      hasEverConnected.current
    ) {
      return (
        <View style={styles.centered}>
          <Text style={styles.endIcon}>👋</Text>
          <Text style={styles.endTitle}>Meeting Ended</Text>
        </View>
      );
    }

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
        {/* RoomView tells us when a remote screen share is active */}
        <RoomView onScreenShareActive={setRemoteScreenShareActive} />
      </View>

      <ControlBar
        onEndCall={handleEndCall}
        onToggleBackgroundFilter={() => setShowFilterPicker(true)}
        activeFilter={activeFilter}
        isApplyingFilter={isApplying}
        remoteScreenShareActive={remoteScreenShareActive}
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