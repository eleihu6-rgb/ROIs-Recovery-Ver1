/**
 * @format
 */

// Must be the very first import for react-native-gesture-handler to work.
import 'react-native-gesture-handler';

import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
