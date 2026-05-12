// src/screens/MeetingScreen.tsx  — diff from original:
//   1. Passes `error` prop to BackgroundFilterPicker
//   2. Calls cleanupProcessor() before room.disconnect()
//   3. Uses the new applyFilter signature (same) — no other changes

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
import { usePiP } from '../hooks/usePip';

const TAG = '[MeetingScreen]';
type AppStage = 'lobby' | 'meeting' | 'ended';

export default function MeetingScreen() {
  const [stage, setStage] = useState<AppStage>('lobby');
  const [joinOptions, setJoinOptions] = useState<JoinOptions>({
    cameraEnabled: true,
    micEnabled: true,
  });

  useEffect(() => {
    NotificationService.initialize().catch((e) =>
      console.warn(TAG, 'NotificationService.initialize() failed', e),
    );
  }, []);

  useEffect(() => {
    if (stage === 'meeting') AudioSession.startAudioSession();
    return () => { if (stage === 'meeting') AudioSession.stopAudioSession(); };
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

function RoomContent({ onEndCall }: { onEndCall: () => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [remoteScreenShareActive, setRemoteScreenShareActive] = useState(false);

  // ✅ Updated hook — now returns cleanupProcessor and error
  const { activeFilter, isApplying, error, applyFilter, cleanupProcessor } =
    useBackgroundFilter();

  const [connState, setConnState] = useState<ConnectionState>(
    room?.state ?? ConnectionState.Connecting,
  );
  const hasEverConnected = useRef(false);
  const { inPipMode, isPipSupported, enterPip } = usePiP();

  const disconnectRef = useRef<() => void>(() => {});
  useEffect(() => {
    disconnectRef.current = async () => {
      // Cleanup background processor before disconnecting
      await cleanupProcessor(localParticipant);
      room?.disconnect();
    };
  }, [room, localParticipant, cleanupProcessor]);

  useEffect(() => {
    if (!room) return;

    const onConnected = () => {
      hasEverConnected.current = true;
      setConnState(ConnectionState.Connected);
      NotificationService.startMeetingTracking(() => disconnectRef.current(), {
        roomName: LIVEKIT_CONFIG.roomName,
        participantCount: room.numParticipants,
      });
    };
    const onReconnecting = () => setConnState(ConnectionState.Reconnecting);
    const onReconnected  = () => setConnState(ConnectionState.Connected);
    const onDisconnected = () => {
      setConnState(ConnectionState.Disconnected);
      NotificationService.stopMeetingTracking();
    };

    room.on(RoomEvent.Connected,    onConnected);
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected,  onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);

    if (room.state === ConnectionState.Connected) {
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

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (connState !== ConnectionState.Connected) return;

    const sub: NativeEventSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (isPipSupported) {
          NotificationService.showPersistentNotification();
          enterPip(9, 16);
        } else {
          Alert.alert('Leave Meeting?', 'PiP is not supported on this device.', [
            { text: 'Stay', style: 'cancel' },
            {
              text: 'Leave',
              style: 'destructive',
              onPress: () => {
                NotificationService.stopMeetingTracking();
                cleanupProcessor(localParticipant).then(() => room?.disconnect());
              },
            },
          ]);
        }
        return true;
      },
    );
    return () => sub.remove();
  }, [connState, isPipSupported, enterPip, room, localParticipant, cleanupProcessor]);

  const isConnected    = connState === ConnectionState.Connected;
  const isReconnecting = connState === ConnectionState.Reconnecting;

  const handleEndCall = useCallback(() => {
    Alert.alert('End Meeting', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          NotificationService.cancelNotification();
          NotificationService.stopMeetingTracking();
          await cleanupProcessor(localParticipant);
          room?.disconnect();
        },
      },
    ]);
  }, [room, localParticipant, cleanupProcessor]);

  const handleFilterSelect = useCallback(
    async (type: typeof activeFilter) => {
      await applyFilter(type, localParticipant);
      // Keep picker open so user can see the applied state
      // (auto-close only on 'none' or non-error)
    },
    [applyFilter, localParticipant],
  );

  if (inPipMode && Platform.OS === 'android') {
    return (
      <View style={styles.pipContainer}>
        <RoomView />
      </View>
    );
  }

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
        {/* Active filter badge */}
        {activeFilter !== 'none' && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>
              {activeFilter.startsWith('blur') ? '🌫️' : '🖼️'}{' '}
              {activeFilter.replace('blur-', '').replace('vbg-', '')}
            </Text>
          </View>
        )}
        <Text style={styles.headerParticipants}>
          {room?.numParticipants ?? 1} participant
          {(room?.numParticipants ?? 1) !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.videoArea}>
        <RoomView onScreenShareActive={setRemoteScreenShareActive} />
      </View>

      <ControlBar
        onEndCall={handleEndCall}
        onToggleBackgroundFilter={() => setShowFilterPicker(true)}
        activeFilter={activeFilter}
        isApplyingFilter={isApplying}
        remoteScreenShareActive={remoteScreenShareActive}
      />

      {/* ✅ Now passes error prop */}
      <BackgroundFilterPicker
        visible={showFilterPicker}
        activeFilter={activeFilter}
        isApplying={isApplying}
        error={error}
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

  filterBadge: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.4)',
  },
  filterBadgeText: {
    color: '#a5b4fc',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
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
  reconnectText: { color: '#f59e0b', fontSize: 13, fontWeight: '600' },

  pipContainer: { flex: 1, backgroundColor: '#000' },
});