module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Required for react-native-reanimated — must be last
    'react-native-reanimated/plugin',
  ],
};
