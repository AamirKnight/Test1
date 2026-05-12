// src/config/livekit.ts
// LiveKit connection configuration

export const LIVEKIT_CONFIG = {
  url: 'wss://newmobile-148pi183.livekit.cloud',
  apiKey: 'API6FHAungZBBxz',
  // Token is pre-generated for testing — in production, fetch from your backend
  token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3Nzg2NTUwNzQsImlkZW50aXR5IjoidGVzdC11c2VyMSIsImlzcyI6IkFQSTZGSEF1bmdaQkJ4eiIsIm5hbWUiOiJ0ZXN0LXVzZXIxIiwibmJmIjoxNzc4NTY4Njc0LCJzdWIiOiJ0ZXN0LXVzZXIxIiwidmlkZW8iOnsicm9vbSI6Imhpby10ZXN0LXJvb20iLCJyb29tSm9pbiI6dHJ1ZX19.Fg0xkhNogFztvOu2q7zeUlMwFPTROtOV5MOXJX9nYns',
  roomName: 'hio-test-room',
};

export const NOTIFICATION_CONFIG = {
  channelId: 'livekit-meeting',
  channelName: 'LiveKit Meeting',
  notificationId: 1001,
  title: 'Meeting in Progress',
  body: 'Tap to return to your meeting',
};