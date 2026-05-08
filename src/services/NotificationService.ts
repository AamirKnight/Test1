// src/services/NotificationService.ts
// Handles foreground notification when app is backgrounded during a meeting

import notifee, {
  AndroidImportance,
  AndroidVisibility,
  EventType,
} from '@notifee/react-native';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import { NOTIFICATION_CONFIG } from '../config/livekit';

class NotificationService {
  private appStateSubscription: NativeEventSubscription | null = null;
  private isInMeeting = false;
  private onReturnCallback: (() => void) | null = null;

  async initialize() {
    // Create notification channel (Android)
    await notifee.createChannel({
      id: NOTIFICATION_CONFIG.channelId,
      name: NOTIFICATION_CONFIG.channelName,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
    });

    // Handle notification press events (background/quit)
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS) {
        await notifee.cancelNotification(
          String(NOTIFICATION_CONFIG.notificationId),
        );
      }
    });

    // Handle notification press events (foreground)
    notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        this.onReturnCallback?.();
      }
    });
  }

  startMeetingTracking(onReturn?: () => void) {
    this.isInMeeting = true;
    this.onReturnCallback = onReturn ?? null;

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );
  }

  stopMeetingTracking() {
    this.isInMeeting = false;
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.cancelNotification();
  }

  private handleAppStateChange = async (nextState: AppStateStatus) => {
    if (!this.isInMeeting) return;

    if (nextState === 'background' || nextState === 'inactive') {
      await this.showMeetingNotification();
    } else if (nextState === 'active') {
      await this.cancelNotification();
    }
  };

  private async showMeetingNotification() {
    try {
      await notifee.displayNotification({
        id: String(NOTIFICATION_CONFIG.notificationId),
        title: `🎥 ${NOTIFICATION_CONFIG.title}`,
        body: NOTIFICATION_CONFIG.body,
        android: {
          channelId: NOTIFICATION_CONFIG.channelId,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          ongoing: true,
          pressAction: { id: 'return-to-meeting', launchActivity: 'default' },
          actions: [
            {
              title: 'Return',
              pressAction: { id: 'return-to-meeting', launchActivity: 'default' },
            },
            {
              title: 'End Call',
              pressAction: { id: 'end-call' },
            },
          ],
          color: '#4f46e5',
          smallIcon: 'ic_notification', // must be in android drawables
          largeIcon: 'ic_launcher',
        },
        ios: {
          categoryId: 'meeting',
          foregroundPresentationOptions: {
            badge: true,
            sound: false,
            banner: true,
            list: true,
          },
        },
      });
    } catch (e) {
      // notifee not available or permissions denied — fail silently
      console.warn('NotificationService: could not display notification', e);
    }
  }

  async cancelNotification() {
    try {
      await notifee.cancelNotification(
        String(NOTIFICATION_CONFIG.notificationId),
      );
    } catch (_) {}
  }

  async requestPermissions() {
    try {
      await notifee.requestPermission();
    } catch (_) {}
  }
}

export default new NotificationService();