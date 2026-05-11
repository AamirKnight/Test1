// src/services/NotificationService.ts

import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
  EventType,
} from '@notifee/react-native';
import {
  AppState,
  AppStateStatus,
  NativeEventSubscription,
  Platform,
} from 'react-native';
import { NOTIFICATION_CONFIG } from '../config/livekit';

const TAG = '[NotifSvc]';
const NOTIF_ID = String(NOTIFICATION_CONFIG.notificationId);
const CHANNEL_ID = NOTIFICATION_CONFIG.channelId;

class NotificationService {
  private appStateSubscription: NativeEventSubscription | null = null;

  private isInMeeting = false;
  private channelReady = false;
  private initPromise: Promise<void> | null = null;

  // disconnect callback from MeetingScreen
  private disconnectCallback: (() => void) | null = null;

  // current meeting info
  private roomName = 'Meeting';
  private participantCount = 1;

  // ─────────────────────────────────────────────────────────────
  // INITIALIZE
  // ─────────────────────────────────────────────────────────────

  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log(TAG, 'initialize() start');

      try {
        const settings = await notifee.requestPermission();

        console.log(
          TAG,
          'permission authorizationStatus =',
          settings.authorizationStatus,
        );

        if (
          settings.authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
          settings.authorizationStatus !== AuthorizationStatus.PROVISIONAL
        ) {
          console.warn(TAG, 'Notification permission NOT granted');
        }
      } catch (e) {
        console.warn(TAG, 'requestPermission threw', e);
      }

      if (Platform.OS === 'android') {
        try {
          const id = await notifee.createChannel({
            id: CHANNEL_ID,
            name: NOTIFICATION_CONFIG.channelName,
            importance: AndroidImportance.HIGH,
            visibility: AndroidVisibility.PUBLIC,
            vibration: false,
            sound: undefined,
          });

          console.log(TAG, 'createChannel resolved with id =', id);

          this.channelReady = true;
        } catch (e) {
          console.warn(TAG, 'createChannel failed', e);
        }
      } else {
        this.channelReady = true;
      }

      // background action handling
      notifee.onBackgroundEvent(async ({ type, detail }) => {
        console.log(TAG, 'onBackgroundEvent', type);

        if (type === EventType.ACTION_PRESS) {
          const actionId = detail.pressAction?.id;

          console.log(TAG, 'background action =', actionId);

          if (actionId === 'end-call') {
            this.disconnectCallback?.();

            await this.stopMeetingTracking();
          }
        }

        if (type === EventType.PRESS) {
          await notifee.cancelNotification(NOTIF_ID).catch(() => {});
        }
      });

      // foreground action handling
      notifee.onForegroundEvent(async ({ type, detail }) => {
        console.log(TAG, 'onForegroundEvent', type);

        if (type === EventType.ACTION_PRESS) {
          const actionId = detail.pressAction?.id;

          console.log(TAG, 'foreground action =', actionId);

          if (actionId === 'end-call') {
            this.disconnectCallback?.();

            await this.stopMeetingTracking();
          }
        }

        if (type === EventType.PRESS) {
          await this.cancelNotification();
        }
      });

      console.log(TAG, 'initialize() complete');
    })();

    return this.initPromise;
  }

  // ─────────────────────────────────────────────────────────────
  // START TRACKING
  // ─────────────────────────────────────────────────────────────

  startMeetingTracking(
    disconnectCallback?: () => void,
    options?: {
      roomName?: string;
      participantCount?: number;
    },
  ) {
    console.log(TAG, 'startMeetingTracking()');

    this.isInMeeting = true;

    this.disconnectCallback = disconnectCallback ?? null;

    if (options?.roomName) {
      this.roomName = options.roomName;
    }

    if (typeof options?.participantCount === 'number') {
      this.participantCount = options.participantCount;
    }

    this.appStateSubscription?.remove();

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE LIVE INFO
  // ─────────────────────────────────────────────────────────────

  async updateMeetingInfo(options: {
    roomName?: string;
    participantCount?: number;
  }) {
    if (options.roomName) {
      this.roomName = options.roomName;
    }

    if (typeof options.participantCount === 'number') {
      this.participantCount = options.participantCount;
    }

    // update active notification if already visible
    if (this.isInMeeting) {
      await this._display();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STOP TRACKING
  // ─────────────────────────────────────────────────────────────

  async stopMeetingTracking() {
    console.log(TAG, 'stopMeetingTracking()');

    this.isInMeeting = false;

    this.disconnectCallback = null;

    this.appStateSubscription?.remove();
    this.appStateSubscription = null;

    await this.cancelNotification();
  }

  // ─────────────────────────────────────────────────────────────
  // SHOW NOTIFICATION
  // ─────────────────────────────────────────────────────────────

  showPersistentNotification() {
    console.log(TAG, 'showPersistentNotification()');

    (async () => {
      if (!this.channelReady) {
        await this.initialize();
      }

      await this._display();
    })().catch((e) => {
      console.warn(TAG, 'showPersistentNotification error', e);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // CANCEL
  // ─────────────────────────────────────────────────────────────

  async cancelNotification() {
    try {
      await notifee.cancelNotification(NOTIF_ID);
    } catch (e) {
      console.warn(TAG, 'cancelNotification error', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // APP STATE
  // ─────────────────────────────────────────────────────────────

  private handleAppStateChange = (nextState: AppStateStatus) => {
    console.log(TAG, 'AppState →', nextState);

    if (!this.isInMeeting) return;

    if (nextState === 'background' || nextState === 'inactive') {
      this.showPersistentNotification();
    } else if (nextState === 'active') {
      this.cancelNotification();
    }
  };

  // ─────────────────────────────────────────────────────────────
  // DISPLAY
  // ─────────────────────────────────────────────────────────────

  private async _display() {
    try {
      const participantText =
        this.participantCount === 1
          ? '1 participant'
          : `${this.participantCount} participants`;

      await notifee.displayNotification({
        id: NOTIF_ID,

        title: `🎥 ${this.roomName}`,

        body: `${participantText} • Meeting in progress`,

        android: {
          channelId: CHANNEL_ID,

          importance: AndroidImportance.HIGH,

          visibility: AndroidVisibility.PUBLIC,

          ongoing: true,

          onlyAlertOnce: true,

          showTimestamp: true,

          timestamp: Date.now(),

          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },

          actions: [
            {
              title: 'Return',
              pressAction: {
                id: 'default',
                launchActivity: 'default',
              },
            },
            {
              title: 'End Call',
              pressAction: {
                id: 'end-call',
              },
            },
          ],

          color: '#4f46e5',
        },

        ios: {
          foregroundPresentationOptions: {
            badge: true,
            sound: false,
            banner: true,
            list: true,
          },
        },
      });

      console.log(TAG, '_display() success');
    } catch (e) {
      console.warn(TAG, '_display() FAILED', e);
    }
  }
}

export default new NotificationService();