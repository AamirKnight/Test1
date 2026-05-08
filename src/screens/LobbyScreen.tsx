// src/screens/LobbyScreen.tsx
// Pre-meeting lobby — permission checks, camera/mic preview, join options
// Uses only @livekit/react-native + react-native built-ins (no vision-camera)

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Animated,
  Easing,
  Linking,
  PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PermissionService from '../services/PermissionService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type JoinOptions = {
  cameraEnabled: boolean;
  micEnabled: boolean;
};

interface LobbyScreenProps {
  roomName: string;
  displayName?: string;
  onJoin: (options: JoinOptions) => void;
}

type PermState = 'checking' | 'granted' | 'denied' | 'blocked';

// ─── Permission pill ──────────────────────────────────────────────────────────

interface PermPillProps {
  icon: string;
  label: string;
  state: PermState;
  onRequest: () => void;
}

function PermPill({ icon, label, state, onRequest }: PermPillProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'checking') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulse, { toValue: 1,   duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [state]);

  const dotColor =
    state === 'granted'  ? '#22d3a5' :
    state === 'denied'   ? '#f87171' :
    state === 'blocked'  ? '#f59e0b' :
                           '#6b7280';

  const actionLabel =
    state === 'denied'  ? 'Tap to allow' :
    state === 'blocked' ? 'Open Settings' :
    state === 'granted' ? 'Allowed' :
                          'Checking…';

  const actionColor =
    state === 'granted'  ? '#22d3a5' :
    state === 'blocked'  ? '#f59e0b' :
    state === 'denied'   ? '#f87171' :
                           '#6b7280';

  return (
    <TouchableOpacity
      style={[styles.permPill, state === 'granted' && styles.permPillGranted]}
      onPress={state !== 'granted' && state !== 'checking' ? onRequest : undefined}
      activeOpacity={state !== 'granted' ? 0.7 : 1}
    >
      <Text style={styles.permIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.permLabel}>{label}</Text>
        <Text style={[styles.permAction, { color: actionColor }]}>{actionLabel}</Text>
      </View>
      <Animated.View style={[styles.permDot, { backgroundColor: dotColor, opacity: pulse }]} />
    </TouchableOpacity>
  );
}

// ─── Device toggle button ─────────────────────────────────────────────────────

interface DeviceToggleProps {
  iconOn: string;
  iconOff: string;
  labelOn: string;
  labelOff: string;
  enabled: boolean;
  permissionGranted: boolean;
  onPress: () => void;
}

function DeviceToggle({ iconOn, iconOff, labelOn, labelOff, enabled, permissionGranted, onPress }: DeviceToggleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    onPress();
  };

  const isLocked = !permissionGranted;

  return (
    <Animated.View style={[styles.toggleWrapper, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={[
          styles.toggle,
          enabled && !isLocked && styles.toggleOn,
          isLocked && styles.toggleLocked,
        ]}
        onPress={handlePress}
        activeOpacity={0.75}
      >
        <Text style={styles.toggleIcon}>{isLocked ? '🔒' : enabled ? iconOn : iconOff}</Text>
        <Text style={[styles.toggleLabel, enabled && !isLocked && styles.toggleLabelOn]}>
          {isLocked ? 'No Permission' : enabled ? labelOn : labelOff}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main lobby ───────────────────────────────────────────────────────────────

export default function LobbyScreen({
  roomName,
  displayName = 'You',
  onJoin,
}: LobbyScreenProps) {
  const [camPerm,  setCamPerm]  = useState<PermState>('checking');
  const [micPerm,  setMicPerm]  = useState<PermState>('checking');
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn,    setMicOn]    = useState(true);

  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(32)).current;

  // ── Check permissions on mount ──
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        const camResult = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        const micResult = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        setCamPerm(camResult ? 'granted' : 'denied');
        setMicPerm(micResult ? 'granted' : 'denied');
      } else {
        // iOS: permissions are requested on first use by WebRTC — treat as denied until we ask
        setCamPerm('denied');
        setMicPerm('denied');
      }
    })();
  }, []);

  // ── Entrance animation ──
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 480, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(slideUp, { toValue: 0, duration: 480, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start();
  }, []);

  // ── Permission request helpers ──
  const requestCamera = useCallback(async () => {
    if (camPerm === 'blocked') {
      Alert.alert(
        'Camera Blocked',
        'Camera access was permanently denied. Please enable it in your device Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        setCamPerm('granted');
        setCameraOn(true);
      } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        setCamPerm('blocked');
      } else {
        setCamPerm('denied');
      }
    } else {
      // iOS: MediaStreamTrack will prompt the OS dialog when LiveKit connects
      setCamPerm('granted');
      setCameraOn(true);
    }
  }, [camPerm]);

  const requestMic = useCallback(async () => {
    if (micPerm === 'blocked') {
      Alert.alert(
        'Microphone Blocked',
        'Microphone access was permanently denied. Please enable it in your device Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        setMicPerm('granted');
        setMicOn(true);
      } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        setMicPerm('blocked');
      } else {
        setMicPerm('denied');
      }
    } else {
      setCamPerm('granted');
      setMicOn(true);
    }
  }, [micPerm]);

  // ── Toggle handlers — request permission if not yet granted ──
  const handleToggleCamera = useCallback(() => {
    if (camPerm !== 'granted') {
      requestCamera();
    } else {
      setCameraOn((v) => !v);
    }
  }, [camPerm, requestCamera]);

  const handleToggleMic = useCallback(() => {
    if (micPerm !== 'granted') {
      requestMic();
    } else {
      setMicOn((v) => !v);
    }
  }, [micPerm, requestMic]);

  const handleJoin = useCallback(() => {
    onJoin({
      cameraEnabled: camPerm === 'granted' && cameraOn,
      micEnabled:    micPerm === 'granted' && micOn,
    });
  }, [onJoin, camPerm, micPerm, cameraOn, micOn]);

  // Initials fallback
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const allGranted = camPerm === 'granted' && micPerm === 'granted';

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View
        style={[
          styles.container,
          { opacity: fadeIn, transform: [{ translateY: slideUp }] },
        ]}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.roomBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.roomBadgeText}>{roomName}</Text>
          </View>
          <Text style={styles.title}>Ready to join?</Text>
          <Text style={styles.subtitle}>Check your setup before entering</Text>
        </View>

        {/* ── Avatar / preview card ── */}
        <View style={styles.previewCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.previewHint}>
              {camPerm !== 'granted'
                ? 'Camera permission needed'
                : cameraOn
                ? 'Camera preview available after joining'
                : 'Camera is off'}
            </Text>
          </View>

          {/* Name badge */}
          <View style={styles.nameOverlay}>
            <Text style={styles.nameOverlayText}>{displayName}</Text>
          </View>

          {/* Muted badge */}
          {(!micOn || micPerm !== 'granted') && (
            <View style={styles.mutedBadge}>
              <Text style={styles.mutedIcon}>🔇</Text>
            </View>
          )}

          {/* Camera-off badge */}
          {(!cameraOn || camPerm !== 'granted') && (
            <View style={styles.camOffBadge}>
              <Text style={styles.camOffIcon}>📷</Text>
            </View>
          )}
        </View>

        {/* ── Permission status pills ── */}
        <Text style={styles.sectionLabel}>PERMISSIONS</Text>
        <View style={styles.permRow}>
          <PermPill
            icon="📹"
            label="Camera"
            state={camPerm}
            onRequest={requestCamera}
          />
          <PermPill
            icon="🎙️"
            label="Microphone"
            state={micPerm}
            onRequest={requestMic}
          />
        </View>

        {/* ── Device toggles ── */}
        <Text style={styles.sectionLabel}>JOIN WITH</Text>
        <View style={styles.toggleRow}>
          <DeviceToggle
            iconOn="📹"
            iconOff="🚫"
            labelOn="Camera On"
            labelOff="Camera Off"
            enabled={cameraOn}
            permissionGranted={camPerm === 'granted'}
            onPress={handleToggleCamera}
          />
          <DeviceToggle
            iconOn="🎙️"
            iconOff="🔇"
            labelOn="Mic On"
            labelOff="Mic Off"
            enabled={micOn}
            permissionGranted={micPerm === 'granted'}
            onPress={handleToggleMic}
          />
        </View>

        {/* ── Join button ── */}
        <View style={styles.joinArea}>
          <TouchableOpacity
            style={styles.joinButton}
            onPress={handleJoin}
            activeOpacity={0.85}
          >
            <Text style={styles.joinText}>Join Meeting</Text>
            <Text style={styles.joinArrow}>→</Text>
          </TouchableOpacity>

          {!allGranted && (
            <Text style={styles.joinHint}>
              You can join without permissions — some features will be unavailable
            </Text>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#080810',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: 24,
    marginBottom: 20,
    gap: 6,
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(79,70,229,0.18)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22d3a5',
  },
  roomBadgeText: {
    color: '#a5b4fc',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#6b7280',
    fontSize: 14,
  },

  // Preview card
  previewCard: {
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#12121f',
    borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.25)',
    marginBottom: 20,
    position: 'relative',
  },
  avatarContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#312e81',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4f46e5',
  },
  avatarText: {
    color: '#e0e7ff',
    fontSize: 26,
    fontWeight: '800',
  },
  previewHint: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '500',
  },
  nameOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  nameOverlayText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  mutedBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    backgroundColor: 'rgba(220,38,38,0.3)',
    borderRadius: 10,
    padding: 5,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.5)',
  },
  mutedIcon: { fontSize: 13 },
  camOffBadge: {
    position: 'absolute',
    top: 10,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    padding: 5,
  },
  camOffIcon: { fontSize: 13 },

  // Section labels
  sectionLabel: {
    color: '#374151',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  // Permission pills
  permRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  permPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  permPillGranted: {
    borderColor: 'rgba(34,211,165,0.3)',
    backgroundColor: 'rgba(34,211,165,0.06)',
  },
  permIcon: { fontSize: 18 },
  permLabel: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
  },
  permAction: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  permDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Device toggles
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  toggleWrapper: {
    flex: 1,
  },
  toggle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 18,
    gap: 8,
  },
  toggleOn: {
    backgroundColor: 'rgba(79,70,229,0.22)',
    borderColor: '#4f46e5',
  },
  toggleLocked: {
    opacity: 0.45,
  },
  toggleIcon: { fontSize: 28 },
  toggleLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  toggleLabelOn: {
    color: '#a5b4fc',
  },

  // Join
  joinArea: { gap: 10 },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4f46e5',
    borderRadius: 20,
    paddingVertical: 18,
    gap: 10,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 8,
  },
  joinText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  joinArrow: {
    color: '#c7d2fe',
    fontSize: 20,
    fontWeight: '700',
  },
  joinHint: {
    color: '#4b5563',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});