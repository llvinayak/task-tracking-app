module.exports = {
  preset: 'jest-expo',
  maxWorkers: '50%', // heavy parse tests slow worker exit under full parallelism
  setupFilesAfterEnv: ['<rootDir>/jest.flush.ts', '<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
};
