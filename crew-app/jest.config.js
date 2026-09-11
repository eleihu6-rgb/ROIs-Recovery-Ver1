/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',

  // File extensions Jest will look for
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Transform TypeScript with babel-jest
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },

  // Ignore node_modules except React Native packages that need transpiling
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-vector-icons|react-native-screens|react-native-safe-area-context|react-native-gesture-handler|react-native-reanimated)/)',
  ],

  // Mock native modules (AsyncStorage) before the test framework loads, so
  // components that transitively import the Redux store can render under Jest.
  setupFiles: ['<rootDir>/jest.setup.js'],

  // Setup files run after the test framework is installed
  setupFilesAfterFramework: [
    '@testing-library/jest-native/extend-expect',
  ],

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/types/**',
  ],

  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  coverageReporters: ['text', 'lcov', 'html'],

  // Module name mapper for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Exclude E2E tests from unit test runs
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
  ],

  // Verbose output in CI
  verbose: true,
};
