// src/screens/MeetingScreen.tsx

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

const TAG = '[MeetingScreen]';

let PictureInPicture: { enterPictureInPictureMode?: () => void } = {};
try {
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

  // Initialize notification channel as early as possible
  useEffect(() => {
    console.log(TAG, 'mount — initializing NotificationService');
    NotificationService.initialize().catch((e) =>
      console.warn(TAG, 'NotificationService.initialize() failed', e),
    );
  }, []);

  useEffect(() => {
    if (stage === 'meeting') AudioSession.startAudioSession();
    return () => { if (stage === 'meeting') AudioSession.stopAudioSession(); };
  }, [stage]);

  // Back button: show notification instantly then minimise
  useEffect(() => {
    if (stage !== 'meeting') return;
    console.log(TAG, 'registering BackHandler');

    const sub: NativeEventSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (Platform.OS === 'android') {
          console.log(TAG, 'back pressed — showing notification');
          NotificationService.showPersistentNotification();
          if (PictureInPicture.enterPictureInPictureMode) {
            PictureInPicture.enterPictureInPictureMode();
          } else {
            BackHandler.exitApp();
          }
          return true;
        }
        return false;
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
    return <LobbyScreen roomName={LIVEKIT_CONFIG.roomName} displayName="You" onJoin={handleJoin} />;
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
  const { activeFilter, isApplying, applyFilter } = useBackgroundFilter();

  const [connState, setConnState] = useState<ConnectionState>(
    room?.state ?? ConnectionState.Connecting,
  );
  const hasEverConnected = useRef(false);

  // Stable ref to disconnect so the notification "End Call" action can call it
  // even when the app is in the background (callback stored in NotificationService)
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
      // Pass disconnect callback so the notification "End Call" action works
      NotificationService.startMeetingTracking(() => disconnectRef.current());
    };
    const onReconnecting = () => { console.log(TAG, 'Reconnecting'); setConnState(ConnectionState.Reconnecting); };
    const onReconnected  = () => { console.log(TAG, 'Reconnected');  setConnState(ConnectionState.Connected); };
    const onDisconnected = () => { console.log(TAG, 'Disconnected'); setConnState(ConnectionState.Disconnected); };

    room.on(RoomEvent.Connected,    onConnected);
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected,  onReconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);

    if (room.state === ConnectionState.Connected) {
      console.log(TAG, 'already connected on mount');
      hasEverConnected.current = true;
      setConnState(ConnectionState.Connected);
      NotificationService.startMeetingTracking(() => disconnectRef.current());
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080810', gap: 14, padding: 32 },
  loadingText: { color: '#9ca3af', fontSize: 16, fontWeight: '500' },
  endIcon: { fontSize: 48 },
  endTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  endBody: { color: '#9ca3af', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  roomContainer: { flex: 1, backgroundColor: '#080810' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(79,70,229,0.15)' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerParticipants: { color: '#6b7280', fontSize: 13 },
  videoArea: { flex: 1 },
  reconnectBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,158,11,0.15)', borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.3)', paddingVertical: 6, gap: 8 },
  reconnectText: { color: '#f59e0b', fontSize: 13, fontWeight: '600' },
});