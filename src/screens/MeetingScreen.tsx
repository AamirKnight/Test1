// src/screens/MeetingScreen.tsx
//
// CHANGES vs previous version:
//  1. PiP mode: uses react-native-pip-android (PipHandler + usePipModeListener)
//     - Back button → PipHandler.enterPipMode(9, 16) instead of exitApp()
//     - PipHandler.setMeetingScreenState(true/false) controls auto-PiP
//     - When inPipMode === true, a minimal PiP UI is rendered (just the video grid)
//  2. Notification guard: startMeetingTracking() is called ONLY after room is
//     Connected; stopMeetingTracking() is called on every disconnect/leave path.
//  3. Removed the broken NativeModules.RNAndroidPip attempt.
//
// Install: yarn add react-native-pip-android
// Then follow the MainActivity.kt change (onPictureInPictureModeChanged).

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

// react-native-pip-android — install with: yarn add react-native-pip-android
// On Android only; safe to import everywhere (no-ops on iOS).
import PipHandler, { usePipModeListener } from 'react-native-pip-android';

const TAG = '[MeetingScreen]';

type AppStage = 'lobby' | 'meeting' | 'ended';

// ─────────────────────────────────────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function MeetingScreen() {
  const [stage, setStage] = useState<AppStage>('lobby');
  const [joinOptions, setJoinOptions] = useState<JoinOptions>({
    cameraEnabled: true,
    micEnabled: true,
  });

  // Initialize notification channel once on mount (no meeting active yet)
  useEffect(() => {
    console.log(TAG, 'mount — initializing NotificationService');
    NotificationService.initialize().catch((e) =>
      console.warn(TAG, 'NotificationService.initialize() failed', e),
    );
  }, []);

  // Audio session: start only while in meeting
  useEffect(() => {
    if (stage === 'meeting') AudioSession.startAudioSession();
    return () => {
      if (stage === 'meeting') AudioSession.stopAudioSession();
    };
  }, [stage]);

  // ── PiP: tell the library whether we're on the meeting screen ──
  // setMeetingScreenState(true)  → auto-PiP when user presses Home
  // setMeetingScreenState(false) → disable auto-PiP everywhere else
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (stage === 'meeting') {
      PipHandler.setMeetingScreenState(true);
      // Set a portrait-friendly 9:16 ratio (width × height in rational units)
      PipHandler.setDefaultPipDimensions(9, 16);
    } else {
      PipHandler.setMeetingScreenState(false);
    }

    return () => {
      // Always disable when leaving the meeting screen
      if (Platform.OS === 'android') {
        PipHandler.setMeetingScreenState(false);
      }
    };
  }, [stage]);

  // ── Back button: enter PiP instead of exiting ──
  // Only active when inside a meeting; lobby/ended use default back behaviour.
  useEffect(() => {
    if (stage !== 'meeting' || Platform.OS !== 'android') return;
    console.log(TAG, 'registering BackHandler → PiP');

    const sub: NativeEventSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        console.log(TAG, 'back pressed — entering PiP (9×16)');
        // Show the persistent notification so the user can return or end the call
        NotificationService.showPersistentNotification();
        // Enter PiP: width=9 height=16 (portrait) — adjust to 16,9 for landscape
        PipHandler.enterPipMode(9, 16);
        return true; // prevent default back navigation
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
    // Ensure notification is removed and tracking stops when meeting ends
    NotificationService.stopMeetingTracking();
    // Disable auto-PiP
    if (Platform.OS === 'android') {
      PipHandler.setMeetingScreenState(false);
    }
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
      options={{ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true }}
      onDisconnected={handleEnded}
    >
      <RoomContent onEndCall={handleEnded} />
    </LiveKitRoom>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOM CONTENT — rendered inside LiveKitRoom context
// ─────────────────────────────────────────────────────────────────────────────

function RoomContent({ onEndCall }: { onEndCall: () => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [remoteScreenShareActive, setRemoteScreenShareActive] = useState(false);
  const { activeFilter, isApplying, applyFilter } = useBackgroundFilter();

  const [connState, setConnState] = useState<ConnectionState>(
    room?.state ?? ConnectionState.Connecting,
  );
  const hasEverConnected = useRef(false);

  // ── PiP mode listener ──
  // usePipModeListener() returns true when the activity enters PiP mode.
  // On iOS it always returns false (no-op).
  const inPipMode = usePipModeListener();

  // Stable ref so notification "End Call" action can call disconnect
  const disconnectRef = useRef<() => void>(() => {});
  useEffect(() => {
    disconnectRef.current = () => {
      console.log(TAG, 'disconnectRef called — disconnecting room');
      room?.disconnect();
    };
  }, [room]);

  useEffect(() => {
    if (!room) return;

    const onConnected = () => {
      console.log(TAG, 'RoomEvent.Connected');
      hasEverConnected.current = true;
      setConnState(ConnectionState.Connected);
      // START notification tracking ONLY when the room is actually connected
      NotificationService.startMeetingTracking(() => disconnectRef.current(), {
        roomName: LIVEKIT_CONFIG.roomName,
        participantCount: room.numParticipants,
      });
    };

    const onReconnecting = () => {
      console.log(TAG, 'Reconnecting');
      setConnState(ConnectionState.Reconnecting);
    };

    const onReconnected = () => {
      console.log(TAG, 'Reconnected');
      setConnState(ConnectionState.Connected);
    };

    const onDisconnected = () => {
      console.log(TAG, 'Disconnected');
      setConnState(ConnectionState.Disconnected);
      // STOP notification tracking immediately when room disconnects
      NotificationService.stopMeetingTracking();
    };

    room.on(RoomEvent.Connected,    onConnected);
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected,  onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);

    // Handle case where room was already connected before this effect ran
    if (room.state === ConnectionState.Connected) {
      console.log(TAG, 'already connected on mount');
      hasEverConnected.current = true;
      setConnState(ConnectionState.Connected);
      NotificationService.startMeetingTracking(() => disconnectRef.current(), {
        roomName: LIVEKIT_CONFIG.roomName,
        participantCount: room.numParticipants,
      });
    }

    return () => {
      room.off(RoomEvent.Connected,    onConnected);
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected,  onReconnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room]);

  const isConnected    = connState === ConnectionState.Connected;
  const isReconnecting = connState === ConnectionState.Reconnecting;

  const handleEndCall = useCallback(() => {
    Alert.alert('End Meeting', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          NotificationService.cancelNotification();
          NotificationService.stopMeetingTracking();
          room?.disconnect();
        },
      },
    ]);
  }, [room]);

  const handleFilterSelect = useCallback(
    async (type: typeof activeFilter) => {
      await applyFilter(type, localParticipant);
      setShowFilterPicker(false);
    },
    [applyFilter, localParticipant],
  );

  // ── PiP UI ──────────────────────────────────────────────────────────────
  // When in PiP mode, render only the video grid — no controls, no header.
  // The tiny window (~100×160dp) has no room for buttons.
  if (inPipMode && Platform.OS === 'android') {
    return (
      <View style={styles.pipContainer}>
        <RoomView />
      </View>
    );
  }

  // ── Loading / disconnected ───────────────────────────────────────────────
  if (!isConnected) {
    if (connState === ConnectionState.Disconnected && hasEverConnected.current) {
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

  // ── Main meeting UI ──────────────────────────────────────────────────────
  return (
    <View style={styles.roomContainer}>
      {isReconnecting && (
        <View style={styles.reconnectBanner}>
          <ActivityIndicator size="small" color="#f59e0b" />
          <Text style={styles.reconnectText}>Reconnecting…</Text>
        </View>
      )}

      {/* Header */}
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

      {/* Video area */}
      <View style={styles.videoArea}>
        <RoomView onScreenShareActive={setRemoteScreenShareActive} />
      </View>

      {/* Control bar */}
      <ControlBar
        onEndCall={handleEndCall}
        onToggleBackgroundFilter={() => setShowFilterPicker(true)}
        activeFilter={activeFilter}
        isApplyingFilter={isApplying}
        remoteScreenShareActive={remoteScreenShareActive}
      />

      {/* Background filter picker */}
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

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080810',
    gap: 14,
    padding: 32,
  },
  loadingText: { color: '#9ca3af', fontSize: 16, fontWeight: '500' },
  endIcon: { fontSize: 48 },
  endTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  endBody: { color: '#9ca3af', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  roomContainer: { flex: 1, backgroundColor: '#080810' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(79,70,229,0.15)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerParticipants: { color: '#6b7280', fontSize: 13 },

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
  reconnectText: { color: '#f59e0b', fontSize: 13, fontWeight: '600' },

  // PiP: fill the tiny window with just the video — no chrome
  pipContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
});