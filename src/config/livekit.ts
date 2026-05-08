// src/config/livekit.ts
// LiveKit connection configuration

export const LIVEKIT_CONFIG = {
  url: 'wss://newmobile-148pi183.livekit.cloud',
  apiKey: 'API6FHAungZBBxz',
  // Token is pre-generated for testing — in production, fetch from your backend
  token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzgyMzE3NDgsImlkZW50aXR5IjoidGVzdC11c2VyIiwiaXNzIjoiQVBJNkZIQXVuZ1pCQnh6IiwibmFtZSI6InRlc3QtdXNlciIsIm5iZiI6MTc3ODE0NTM0OCwic3ViIjoidGVzdC11c2VyIiwidmlkZW8iOnsicm9vbSI6Imhpby10ZXN0LXJvb20iLCJyb29tSm9pbiI6dHJ1ZX19.4B7fLefcVGYTWg7LoCq-3nv9ohn-rK7fOI3CnXt4_EU',
  roomName: 'hio-test-room',
};

export const NOTIFICATION_CONFIG = {
  channelId: 'livekit-meeting',
  channelName: 'LiveKit Meeting',
  notificationId: 1001,
  title: 'Meeting in Progress',
  body: 'Tap to return to your meeting',
};