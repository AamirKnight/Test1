// src/services/PermissionService.ts
// Handles camera, microphone, and notification permissions on Android & iOS

import { Platform, PermissionsAndroid } from 'react-native';

export type PermissionResult = {
  camera: boolean;
  microphone: boolean;
};

class PermissionService {
  async requestMediaPermissions(): Promise<PermissionResult> {
    if (Platform.OS === 'android') {
      return this.requestAndroidPermissions();
    }
    // iOS permissions are handled automatically by WebRTC on first use
    return { camera: true, microphone: true };
  }

  private async requestAndroidPermissions(): Promise<PermissionResult> {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      const camera =
        granted[PermissionsAndroid.PERMISSIONS.CAMERA] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const microphone =
        granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] ===
        PermissionsAndroid.RESULTS.GRANTED;

      return { camera, microphone };
    } catch (err) {
      console.warn('PermissionService: failed to request permissions', err);
      return { camera: false, microphone: false };
    }
  }

  async checkAndroidPermission(permission: string): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const result = await PermissionsAndroid.check(permission as any);
      return result;
    } catch {
      return false;
    }
  }
}

export default new PermissionService();