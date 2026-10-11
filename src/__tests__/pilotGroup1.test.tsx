import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { act, renderHook, screen } from '@testing-library/react-native';
import React from 'react';
import { Keyboard, ScrollView, Text as RNText } from 'react-native';

import { Screen } from '@/components/ui';
import { useKeyboardOverlap } from '@/hooks/useKeyboardInset';
import { useBottomInsetExtra, useScreenBottomPadding } from '@/hooks/useScreenBottomPadding';
import { renderWithProviders } from '@/test/testUtils';
const appJson = require('../../app.json') as { expo: { android: { blockedPermissions: string[] } } };

const flat = (style: unknown) => Object.assign({}, ...[style].flat(6).filter(Boolean));
const INSET = 34; // renderWithProviders insets.bottom

describe('B1: bottom safe-area inset for content when no tab bar clears it', () => {
  it('Screen scroll content gets the inset when there is no tab bar and no bottom edge (module pushed from More)', () => {
    renderWithProviders(
      <Screen scroll edges={['left', 'right']}>
        <RNText>body</RNText>
      </Screen>,
    );
    expect(flat(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom).toBe(16 + INSET);
  });

  it('inside the tab bar the tab bar clears it: no extra', () => {
    renderWithProviders(
      <BottomTabBarHeightContext.Provider value={56}>
        <Screen scroll edges={['left', 'right']}>
          <RNText>body</RNText>
        </Screen>
      </BottomTabBarHeightContext.Provider>,
    );
    expect(flat(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom).toBeUndefined();
  });

  it('a screen that pads the bottom edge itself, or has a footer, gets no extra on the content', () => {
    const edge = renderWithProviders(
      <Screen scroll edges={['left', 'right', 'bottom']}>
        <RNText>body</RNText>
      </Screen>,
    );
    expect(flat(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom).toBeUndefined();
    edge.unmount();
    renderWithProviders(
      <Screen scroll edges={['left', 'right']} footer={<RNText>F</RNText>}>
        <RNText>body</RNText>
      </Screen>,
    );
    expect(flat(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom).toBeUndefined();
  });

  it('useScreenBottomPadding adds the inset only without a tab bar (lists use it)', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => renderWrapper(children, undefined);
    const inStack = renderHook(() => useScreenBottomPadding(24), { wrapper });
    expect(inStack.result.current).toBe(24 + INSET);
    const inTabs = renderHook(() => useBottomInsetExtra(), { wrapper: ({ children }) => renderWrapper(children, 56) });
    expect(inTabs.result.current).toBe(0);
  });
});

function renderWrapper(children: React.ReactNode, tab: number | undefined) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context') as typeof import('react-native-safe-area-context');
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: INSET } }}>
      <BottomTabBarHeightContext.Provider value={tab}>{children}</BottomTabBarHeightContext.Provider>
    </SafeAreaProvider>
  );
}

describe('K1-K3: useKeyboardOverlap hardening', () => {
  const handlers = new Map<string, ((e: object) => void)[]>();
  beforeEach(() => {
    handlers.clear();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (e: object) => void) => {
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
      return { remove: () => handlers.set(name, (handlers.get(name) ?? []).filter((h) => h !== fn)) };
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());
  const emit = (name: string, e: object) => act(() => void (handlers.get(name) ?? []).forEach((h) => h(e)));
  const at = (y: number, h: number, later?: { cb?: (x: number, y: number, w: number, h: number) => void }) => ({
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => (later ? (later.cb = cb) : cb(0, y, 390, h)),
  });

  it('K1: a missing / NaN screenY never produces NaN: falls back to the keyboard height, or 0 when that is unusable', () => {
    const { result } = renderHook(() => useKeyboardOverlap());
    (result.current.ref as { current: unknown }).current = at(100, 600);
    emit('keyboardWillShow', { endCoordinates: { height: 300 } });
    expect(result.current.overlap).toBe(300);
    emit('keyboardWillHide', {});
    emit('keyboardWillShow', { endCoordinates: { screenY: NaN, height: NaN } });
    expect(result.current.overlap).toBe(0);
    emit('keyboardWillHide', {});
    emit('keyboardWillShow', {});
    expect(result.current.overlap).toBe(0);
    expect(Number.isNaN(result.current.overlap)).toBe(false);
  });

  it('K2: a measure callback that lands after the keyboard hid is ignored', () => {
    const { result } = renderHook(() => useKeyboardOverlap());
    const late: { cb?: (x: number, y: number, w: number, h: number) => void } = {};
    (result.current.ref as { current: unknown }).current = at(0, 0, late);
    emit('keyboardWillShow', { endCoordinates: { screenY: 500, height: 300 } });
    emit('keyboardWillHide', {});
    act(() => late.cb!(0, 100, 390, 600)); // would have meant overlap 200
    expect(result.current.overlap).toBe(0);
  });

  it('K3: iOS follows keyboardWillChangeFrame (height changes while shown) and ignores a stale measure from the old frame', () => {
    const { result } = renderHook(() => useKeyboardOverlap());
    (result.current.ref as { current: unknown }).current = at(100, 600); // bottom 700
    emit('keyboardWillShow', { endCoordinates: { screenY: 544, height: 300 } });
    expect(result.current.overlap).toBe(156);
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 444, height: 400 } });
    expect(result.current.overlap).toBe(256);
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 844, height: 0 } }); // frame slides off-screen
    expect(result.current.overlap).toBe(0);
  });
});

describe('app.json: permissions', () => {
  it('blocks the legacy storage and overlay permissions (VIBRATE, needed for haptics, is not blocked)', () => {
    const blocked = appJson.expo.android.blockedPermissions;
    expect(blocked).toEqual(
      expect.arrayContaining([
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ]),
    );
    expect(blocked).not.toContain('android.permission.VIBRATE');
  });
});
