/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { registerGlobals } from '@livekit/react-native';
import App from './App';
import { name as appName } from './app.json';

// Must be called before any LiveKit code runs
registerGlobals();

AppRegistry.registerComponent(appName, () => App);