// Register native-module mocks so components that transitively import the Redux
// store (which imports AsyncStorage) can be rendered under Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Pin the window to a regular iPhone (iPhone Air, 420x912pt). The preset's
// 750x1334 reads as the iPhone Duo's wide inner screen to `useLayout`, and every
// component test was written against the compact phone layout. A Duo test mocks
// `useLayout` itself (see duoPageLayouts.test.tsx).
const { Dimensions } = require('react-native');
const PHONE_WINDOW = { width: 420, height: 912, scale: 3, fontScale: 1 };
Dimensions.set({ window: PHONE_WINDOW, screen: PHONE_WINDOW });

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(async () => true),
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
}));
