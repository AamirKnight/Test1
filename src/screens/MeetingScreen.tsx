// src/screens/MeetingScreen.tsx
// Top-level meeting screen — wires LiveKit room, controls, background service

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
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
import PermissionService from '../services/PermissionService';
import { useBackgroundFilter } from '../hooks/useBackgroundFilter';
import { RoomView } from '../components/RoomView';
import { ControlBar } from '../components/ControlBar';
import { BackgroundFilterPicker } from '../components/BackgroundFilterPicker';

export default function MeetingScreen() {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Request permissions + init notification service on mount
  useEffect(() => {
    (async () => {
      await NotificationService.initialize();
      await NotificationService.requestPermissions();

      const { camera, microphone } =
        await PermissionService.requestMediaPermissions();

      if (!camera || !microphone) {
        setPermissionError(
          'Camera and microphone permissions are required to join the meeting.',
        );
        return;
      }
      setPermissionsGranted(true);
    })();
  }, []);

  // Start / stop audio session
  useEffect(() => {
    if (!permissionsGranted) return;
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, [permissionsGranted]);

  // Start background meeting tracking once connected
  useEffect(() => {
    if (isConnected) {
      NotificationService.startMeetingTracking();
    }
    return () => {
      if (isConnected) NotificationService.stopMeetingTracking();
    };
  }, [isConnected]);

  if (permissionError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>🚫</Text>
        <Text style={styles.errorTitle}>Permissions Required</Text>
        <Text style={styles.errorBody}>{permissionError}</Text>
      </View>
    );
  }

  if (!permissionsGranted) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loadingText}>Requesting permissions…</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_CONFIG.url}
      token={LIVEKIT_CONFIG.token}
      connect={true}
      audio={true}
      video={true}
      options={{
        adaptiveStream: { pixelDensity: 'screen' },
        // Optimisations for low-bandwidth
        dynacast: true,
      }}
      onConnected={() => setIsConnected(true)}
      onDisconnected={() => {
        setIsConnected(false);
        NotificationService.stopMeetingTracking();
      }}
    >
      <RoomContent onConnectionChange={setIsConnected} />
    </LiveKitRoom>
  );
}

// Inner component so it can use LiveKit hooks
function RoomContent({
  onConnectionChange,
}: {
  onConnectionChange: (connected: boolean) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const { activeFilter, isApplying, applyFilter } = useBackgroundFilter();

  const connectionState = room?.state;
  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;
  const isConnected = connectionState === ConnectionState.Connected;
  const isReconnecting = connectionState === ConnectionState.Reconnecting;

  useEffect(() => {
    onConnectionChange(isConnected);
  }, [isConnected, onConnectionChange]);

  const handleEndCall = useCallback(() => {
    Alert.alert('End Meeting', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => room?.disconnect(),
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

  if (!isConnected && isConnecting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loadingText}>
          {isReconnecting ? 'Reconnecting…' : 'Joining meeting…'}
        </Text>
      </View>
    );
  }

  if (connectionState === ConnectionState.Disconnected) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>👋</Text>
        <Text style={styles.errorTitle}>Meeting Ended</Text>
        <Text style={styles.errorBody}>You have left the meeting.</Text>
      </View>
    );
  }

  return (
    <View style={styles.roomContainer}>
      {/* Reconnecting banner */}
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
          <Text style={styles.headerTitle}>
            {LIVEKIT_CONFIG.roomName}
          </Text>
        </View>
        <Text style={styles.headerParticipants}>
          {room?.numParticipants ?? 1} participant
          {(room?.numParticipants ?? 1) !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Video grid */}
      <View style={styles.videoArea}>
        <RoomView />
      </View>

      {/* Controls */}
      <ControlBar
        onEndCall={handleEndCall}
        onToggleBackgroundFilter={() => setShowFilterPicker(true)}
        activeFilter={activeFilter}
        isApplyingFilter={isApplying}
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

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0f',
    gap: 16,
    padding: 32,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '500',
  },
  errorIcon: {
    fontSize: 48,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  roomContainer: {
    flex: 1,
    backgroundColor: '#0a0a0f',
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
  videoArea: {
    flex: 1,
  },
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