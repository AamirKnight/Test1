/**
 * LiveKit Meeting App
 * Full-featured video conferencing with background support
 */

import React, { useEffect } from 'react';
import { StatusBar, StyleSheet, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerGlobals } from '@livekit/react-native';
import MeetingScreen from './src/screens/MeetingScreen';

// Register WebRTC globals — must be called before any LiveKit usage
registerGlobals();

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <View style={styles.container}>
        <MeetingScreen />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
});