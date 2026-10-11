import '@testing-library/react-native/build/matchers/extend-expect';
import { notifyManager } from '@tanstack/react-query';
import { act, configure } from '@testing-library/react-native';
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.test/api';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
jest.mock('@react-native-community/netinfo', () => jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock.js'));

// In-memory expo-secure-store so tests exercise the real storage wrapper.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});
jest.setTimeout(20000);
// Cold module transforms on a busy machine can exceed the 1s default of findBy/waitFor.
configure({ asyncUtilTimeout: 5000 });

// TanStack notifies React from a setTimeout(0) flush, which lands outside any
// act() scope and spams "not wrapped in act(...)". Route the flush through act().
notifyManager.setBatchNotifyFunction((callback) => {
  act(() => {
    callback();
  });
});

