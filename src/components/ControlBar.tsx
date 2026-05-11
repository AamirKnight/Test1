// src/components/ControlBar.tsx
// Bottom control bar: mic, camera, screen share, blur, end call
// - Screen share button disabled when someone else is already sharing
// - Exports screen share active state for RoomView

import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalParticipant, useRoomContext } from '@livekit/react-native';
import { ScreenCapturePickerView } from '@livekit/react-native-webrtc';
import { Track } from 'livekit-client';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { BackgroundFilterType } from '../hooks/useBackgroundFilter';

interface ControlBarProps {
  onEndCall: () => void;
  onToggleBackgroundFilter: () => void;
  activeFilter: BackgroundFilterType;
  isApplyingFilter: boolean;
  /** True when any remote participant is sharing their screen */
  remoteScreenShareActive?: boolean;
}

export function ControlBar({
  onEndCall,
  onToggleBackgroundFilter,
  activeFilter,
  isApplyingFilter,
  remoteScreenShareActive = false,
}: ControlBarProps) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const { quality, qualityColor, qualityBars } = useNetworkQuality();

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareLoading, setScreenShareLoading] = useState(false);

  const isMicOn    = localParticipant?.isMicrophoneEnabled ?? false;
  const isCameraOn = localParticipant?.isCameraEnabled     ?? false;

  const toggleMic = async () => {
    await localParticipant?.setMicrophoneEnabled(!isMicOn);
  };

  const toggleCamera = async () => {
    await localParticipant?.setCameraEnabled(!isCameraOn);
  };

  const toggleScreenShare = async () => {
    // Don't allow sharing when someone else is already sharing
    if (remoteScreenShareActive && !isScreenSharing) return;
    if (screenShareLoading) return;

    setScreenShareLoading(true);
    try {
      if (isScreenSharing) {
        await localParticipant?.setScreenShareEnabled(false);
        setIsScreenSharing(false);
      } else {
        await localParticipant?.setScreenShareEnabled(true);
        setIsScreenSharing(true);
      }
    } catch (e) {
      console.warn('ControlBar: screen share failed', e);
    } finally {
      setScreenShareLoading(false);
    }
  };

  const flipCamera = async () => {
    const camPub = localParticipant?.getTrackPublication(Track.Source.Camera);
    if (camPub?.track) {
      await (camPub.track as any).switchCamera?.();
    }
  };

  // Screen share button state
  const shareDisabled = remoteScreenShareActive && !isScreenSharing;
  const shareIcon = screenShareLoading
    ? '⏳'
    : isScreenSharing
    ? '🛑'
    : shareDisabled
    ? '🚫'
    : '🖥️';
  const shareLabel = isScreenSharing
    ? 'Stop'
    : shareDisabled
    ? 'Sharing'
    : 'Share';

  return (
    <View style={styles.container}>
      {/* Network quality indicator */}
      <View style={styles.qualityRow}>
        <View style={styles.qualityBars}>
          {[1, 2, 3, 4].map((bar) => (
            <View
              key={bar}
              style={[
                styles.bar,
                {
                  height: bar * 4 + 4,
                  backgroundColor: bar <= qualityBars ? qualityColor : '#333',
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.qualityText, { color: qualityColor }]}>
          {quality === 'lost' ? 'No signal' : quality}
        </Text>
      </View>

      {/* Controls row */}
      <View style={styles.controls}>
        {/* Microphone */}
        <ControlButton
          onPress={toggleMic}
          icon={isMicOn ? '🎙️' : '🔇'}
          label={isMicOn ? 'Mute' : 'Unmute'}
          active={isMicOn}
          variant="default"
        />

        {/* Camera */}
        <ControlButton
          onPress={toggleCamera}
          icon={isCameraOn ? '📹' : '📷'}
          label={isCameraOn ? 'Cam off' : 'Cam on'}
          active={isCameraOn}
          variant="default"
        />

        {/* Flip camera */}
        <ControlButton
          onPress={flipCamera}
          icon="🔄"
          label="Flip"
          active={false}
          variant="default"
        />

        {/* Screen share — disabled when remote is sharing */}
        <ControlButton
          onPress={toggleScreenShare}
          icon={shareIcon}
          label={shareLabel}
          active={isScreenSharing}
          variant={isScreenSharing ? 'active' : 'default'}
          loading={screenShareLoading}
          disabled={shareDisabled}
        />

        {/* Background filter */}
        <ControlButton
          onPress={onToggleBackgroundFilter}
          icon={isApplyingFilter ? '⏳' : activeFilter !== 'none' ? '✨' : '🌫️'}
          label="BG"
          active={activeFilter !== 'none'}
          variant={activeFilter !== 'none' ? 'active' : 'default'}
          loading={isApplyingFilter}
        />

        {/* End call */}
        <ControlButton
          onPress={onEndCall}
          icon="📵"
          label="End"
          active={false}
          variant="danger"
        />
      </View>

      {/* iOS screen capture picker — must be in tree for screen share to work */}
      {Platform.OS === 'ios' && (
        <ScreenCapturePickerView style={styles.hidden} />
      )}
    </View>
  );
}

interface ControlButtonProps {
  onPress: () => void;
  icon: string;
  label: string;
  active: boolean;
  variant: 'default' | 'active' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

function ControlButton({
  onPress,
  icon,
  label,
  active,
  variant,
  loading,
  disabled,
}: ControlButtonProps) {
  const bgColor = disabled
    ? 'rgba(255,255,255,0.03)'
    : {
        default: active ? 'rgba(79,70,229,0.25)' : 'rgba(255,255,255,0.08)',
        active: 'rgba(79,70,229,0.5)',
        danger: '#dc2626',
      }[variant];

  const borderColor = disabled
    ? 'rgba(255,255,255,0.05)'
    : {
        default: active ? '#4f46e5' : 'rgba(255,255,255,0.12)',
        active: '#6366f1',
        danger: '#ef4444',
      }[variant];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: bgColor, borderColor },
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      activeOpacity={disabled ? 1 : 0.7}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={[styles.buttonIcon, disabled && styles.buttonIconDisabled]}>
          {icon}
        </Text>
      )}
      <Text style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10,10,15,0.95)',
    paddingBottom: 16,
    paddingTop: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(79,70,229,0.2)',
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 6,
  },
  qualityBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 20,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
  qualityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 52,
    gap: 4,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonIcon: {
    fontSize: 20,
  },
  buttonIconDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: '#ccc',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  buttonLabelDisabled: {
    color: '#555',
  },
  hidden: {
    width: 0,
    height: 0,
  },
});