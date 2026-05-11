// src/screens/MeetingScreen.tsx
//
// PiP: uses our OWN PipModule.kt native module via the usePiP() hook.
// DO NOT import react-native-pip-android — that package has its own native
// module and conflicts with PipModule.kt. Remove it from package.json:
//   yarn remove react-native-pip-android
//
// PiP flow:
//   - Back button while in meeting → enterPip() → Android PiP window
//   - PipModule fires "onPipModeChanged" event → usePiP sets inPipMode
//   - When inPipMode === true → minimal PiP UI (video only, no controls)
//
// Notification flow:
//   - startMeetingTracking() called ONLY after LiveKit room is Connected
//   - stopMeetingTracking() called on EVERY disconnect/leave path
//   - _isInMeeting guard in NotificationService prevents stray notifications

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

// ✅ Our OWN hook — talks to PipModule.kt directly via NativeModules
import { usePiP } from '../hooks/usePip';

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

  useEffect(() => {
    console.log(TAG, 'mount — initializing NotificationService');
    NotificationService.initialize().catch((e) =>
      console.warn(TAG, 'NotificationService.initialize() failed', e),
    );
  }, []);

  // Audio session: start only while in meeting
  useEffect(() => {
    if (stage === 'meeting') {
      AudioSession.startAudioSession();
    }
    return () => {
      if (stage === 'meeting') {
        AudioSession.stopAudioSession();
      }
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

  // ✅ Use OUR OWN usePiP hook (talks to PipModule.kt via NativeModules)
  // inPipMode    → true when Android has put us in the PiP window
  // isPipSupported → false on API < 26 or unsupported device
  // enterPip()   → calls PipModule.enterPipMode(9, 16)
  const { inPipMode, isPipSupported, enterPip } = usePiP();

  // Debug: log PiP support on mount
  useEffect(() => {
    console.log(TAG, 'PiP supported:', isPipSupported);
  }, [isPipSupported]);

  // Stable ref so notification "End Call" action can call disconnect
  const disconnectRef = useRef<() => void>(() => {});
  useEffect(() => {
    disconnectRef.current = () => {
      console.log(TAG, 'disconnectRef called — disconnecting room');
      room?.disconnect();
    };
  }, [room]);

  // ── Room event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!room) return;

    const onConnected = () => {
      console.log(TAG, 'RoomEvent.Connected');
      hasEverConnected.current = true;
      setConnState(ConnectionState.Connected);
      // ✅ START notification tracking ONLY when room is actually Connected
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
      // ✅ STOP notification tracking immediately when room disconnects
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

  // ── Back button: enter PiP instead of navigating back ────────────────────
  // Only when we are connected AND PiP is supported on this device.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (connState !== ConnectionState.Connected) return;

    console.log(TAG, 'registering BackHandler → PiP (supported:', isPipSupported, ')');

    const sub: NativeEventSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (isPipSupported) {
          console.log(TAG, 'back pressed — entering PiP');
          // Show persistent notification so user can return or end call from shade
          NotificationService.showPersistentNotification();
          // ✅ Enter PiP using OUR native module: portrait 9:16
          enterPip(9, 16);
        } else {
          console.log(TAG, 'back pressed — PiP not supported, showing alert');
          // Fallback: ask user if they want to leave
          Alert.alert('Leave Meeting?', 'PiP is not supported on this device.', [
            { text: 'Stay', style: 'cancel' },
            {
              text: 'Leave',
              style: 'destructive',
              onPress: () => {
                NotificationService.stopMeetingTracking();
                room?.disconnect();
              },
            },
          ]);
        }
        return true; // always consume back event
      },
    );

    return () => {
      console.log(TAG, 'removing BackHandler');
      sub.remove();
    };
  }, [connState, isPipSupported, enterPip, room]);

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
  // When in PiP mode, render ONLY the video grid — no controls, no header.
  // The tiny PiP window (~100×160dp) has no room for buttons.
  if (inPipMode && Platform.OS === 'android') {
    return (
      <View style={styles.pipContainer}>
        <RoomView />
      </View>
    );
  }

  // ── Loading / connecting ─────────────────────────────────────────────────
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

  // PiP: fill the tiny window with only the video — no chrome
  pipContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
});