import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, Animated, Keyboard, Modal, Platform, ScrollView, Text as RNText, View } from 'react-native';

import {
  BottomSheet,
  Button,
  Chip,
  ChoiceChips,
  Input,
  OptionRow,
  Screen,
  Skeleton,
  TabStrip,
  Text,
  useToast,
} from '@/components/ui';
import { useKeyboardOpen, useKeyboardOverlap } from '@/hooks/useKeyboardInset';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { TabButton } from '@/navigation/AppTabs';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { useAuthStore } from '@/store/authStore';
import { sessionUser } from '@/test/fixtures';
import { labelInNameViolations } from '@/test/a11y';
import { renderWithProviders } from '@/test/testUtils';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useThemeStore } from '@/theme/themeStore';

const flat = (node: { props: { style?: unknown } }) => Object.assign({}, ...[node.props.style].flat(6).filter(Boolean));
const signedIn = () => useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ roleId: 5 }) });

afterEach(() => {
  useThemeStore.setState({ mode: 'system' });
  jest.useRealTimers();
  jest.restoreAllMocks();
  // RN's AccessibilityInfo is already a jest.fn: restoreAllMocks does not undo mockResolvedValue, so reset explicitly.
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
  (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(false);
});

describe('A2: radio-style controls expose checked', () => {
  it('Chip role=radio, OptionRow and ChoiceChips', () => {
    renderWithProviders(
      <>
        <Chip role="radio" label="High" selected onPress={() => undefined} />
        <Chip label="Mine" selected onPress={() => undefined} />
        <OptionRow label="Alpha" selected onPress={() => undefined} />
        <OptionRow label="Move to Beta" selected={false} onPress={() => undefined} />
        <ChoiceChips
          value="a"
          onChange={() => undefined}
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
        />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'High' }).props.accessibilityState).toMatchObject({ selected: true, checked: true });
    expect(screen.getByRole('button', { name: 'Mine' }).props.accessibilityState.checked).toBeUndefined();
    expect(screen.getByRole('radio', { name: 'Alpha' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: 'Move to Beta' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByRole('radio', { name: 'B' }).props.accessibilityState).toMatchObject({ checked: false });
  });

  it('Profile theme picker radios are checked radios named "{x} theme"; section labels are headers', () => {
    signedIn();
    useThemeStore.setState({ mode: 'dark' });
    renderWithProviders(<ProfileScreen />, { navigation: true });
    expect(screen.getByRole('radio', { name: 'Dark theme' }).props.accessibilityState).toMatchObject({ checked: true, selected: true });
    expect(screen.getByRole('radio', { name: 'Light theme' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(expect.arrayContaining(['ACCOUNT', 'APPEARANCE']));
  });
});

describe('A3: Label in Name', () => {
  it('flags a label that does not contain the visible text and accepts the fixed ones', () => {
    const first = renderWithProviders(<Button label="Make primary" accessibilityLabel="Make Linus primary" onPress={() => undefined} />);
    expect(labelInNameViolations()).toHaveLength(1);
    first.unmount();
    renderWithProviders(
      <>
        <Button label="Make primary" accessibilityLabel="Make primary: Linus" onPress={() => undefined} />
        <Button label="Pass" accessibilityLabel="Pass Login form" onPress={() => undefined} />
        <Button label="Next" iconOnly icon="chevron-forward" accessibilityLabel="Next day" onPress={() => undefined} />
        <Chip label="Mine" selected={false} count={3} onPress={() => undefined} />
      </>,
    );
    expect(labelInNameViolations()).toEqual([]);
  });

  it('holds for Profile and for sheets with a custom close label', () => {
    signedIn();
    renderWithProviders(
      <>
        <ProfileScreen />
        <BottomSheet visible kind="form" closeLabel="Discard" title="Add time" onClose={() => undefined}>
          <Text>x</Text>
        </BottomSheet>
        <BottomSheet visible kind="picker" title="Pick" onClose={() => undefined}>
          <Text>y</Text>
        </BottomSheet>
      </>,
      { navigation: true },
    );
    expect(labelInNameViolations()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Discard Add time' })).toBeTruthy();
  });
});

describe('A4: Input typing face and geometry', () => {
  it('typed text uses Inter regular once fonts are loaded, token line height, constant geometry on focus', () => {
    render(
      <ThemeProvider fontsLoaded>
        <Input label="Title" value="x" onChangeText={() => undefined} />
      </ThemeProvider>,
    );
    const s = flat(screen.getByLabelText('Title'));
    expect(s.fontFamily).toBe('Inter_400Regular');
    expect(s.fontWeight).toBeUndefined();
    expect(s.lineHeight).toBe(24);
    const before = s.paddingVertical as number;
    fireEvent(screen.getByLabelText('Title'), 'focus');
    // border 1 -> 2dp: padding gives one dp back, so the box and text do not move.
    expect(before - (flat(screen.getByLabelText('Title')).paddingVertical as number)).toBe(1);
  });

  it('system font before fonts load; a disabled field is muted', () => {
    renderWithProviders(<Input label="Locked" value="v" editable={false} onChangeText={() => undefined} />);
    const s = flat(screen.getByLabelText('Locked'));
    expect(s.fontFamily).toBeUndefined();
    expect(s.fontWeight).toBe('400');
  });
});

describe('A5: Button', () => {
  it('compact icon-only has a 44x44 target (hitSlop on all sides)', () => {
    renderWithProviders(<Button label="Go" iconOnly size="compact" icon="play" accessibilityLabel="Start timer on X" onPress={() => undefined} />);
    const b = screen.getByRole('button', { name: 'Start timer on X' });
    expect(flat(b).minHeight + b.props.hitSlop.top + b.props.hitSlop.bottom).toBeGreaterThanOrEqual(44);
    expect(flat(b).minWidth + b.props.hitSlop.left + b.props.hitSlop.right).toBeGreaterThanOrEqual(44);
  });

  it('loading does NOT fade (only disabled does)', () => {
    renderWithProviders(
      <>
        <Button label="Busy" loading onPress={() => undefined} />
        <Button label="Off" disabled onPress={() => undefined} />
      </>,
    );
    expect(flat(screen.getByRole('button', { name: 'Busy' })).opacity).toBe(1);
    expect(flat(screen.getByRole('button', { name: 'Off' })).opacity).toBeLessThan(1);
  });

  it('warns in dev when an icon-only button has no accessible name', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // @ts-expect-error accessibilityLabel is required for iconOnly at type level
    renderWithProviders(<Button label="x" iconOnly icon="play" onPress={() => undefined} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('accessibilityLabel'));
  });
});

describe('A8: TabStrip', () => {
  it('is always a horizontal ScrollView that fills the width; tabs grow but never shrink', () => {
    renderWithProviders(
      <TabStrip
        tabs={[
          { key: 'a', label: 'Overview' },
          { key: 'b', label: 'Time' },
        ]}
        value="a"
        onChange={() => undefined}
      />,
    );
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.horizontal).toBe(true);
    expect(Object.assign({}, ...[scroll.props.contentContainerStyle].flat())).toMatchObject({ flexGrow: 1 });
    expect(flat(screen.getByRole('tab', { name: 'Overview' }))).toMatchObject({ flexGrow: 1, flexShrink: 0, paddingHorizontal: 12 });
  });
});

describe('A9: TabButton', () => {
  it('shows the indicator only when selected and forwards role / aria-label / aria-selected', () => {
    const onPress = jest.fn();
    const first = renderWithProviders(
      <TabButton role="tab" aria-label="Tasks" aria-selected onPress={onPress}>
        <RNText>Tasks</RNText>
      </TabButton>,
    );
    const indicator = () => screen.UNSAFE_root.findAll((n: { type: unknown; props: { style?: unknown } }) => typeof n.type === 'string' && n.props.style && flat(n).height === 3 && flat(n).width === 28);
    const btn = screen.getByLabelText('Tasks');
    expect(btn.props.accessibilityState).toMatchObject({ selected: true });
    expect(btn.props.role).toBe('tab');
    expect(indicator().length).toBeGreaterThan(0);
    expect(flat(indicator()[0]!).backgroundColor).not.toBe('transparent');
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalled();
    first.unmount();
    renderWithProviders(
      <TabButton role="tab" aria-label="Tasks" aria-selected={false} onPress={onPress}>
        <RNText>Tasks</RNText>
      </TabButton>,
    );
    expect(flat(indicator()[0]!).backgroundColor).toBe('transparent');
  });
});

describe('A10: Screen', () => {
  it('renders the header above the body, passes stickyHeaderIndices, footer sits outside the scroll area', () => {
    renderWithProviders(
      <Screen scroll header={<RNText>HEADER</RNText>} footer={<RNText>FOOTER</RNText>} stickyHeaderIndices={[1]}>
        <RNText>a</RNText>
        <RNText>b</RNText>
      </Screen>,
    );
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.stickyHeaderIndices).toEqual([1]);
    expect(scroll.findAll((n: { props: { children?: unknown } }) => n.props.children === 'FOOTER' || n.props.children === 'HEADER')).toHaveLength(0);
    expect(screen.getByText('HEADER')).toBeTruthy();
    expect(screen.getByText('FOOTER')).toBeTruthy();
  });

  it('footer clears the bottom inset only when nothing else does (no bottom edge, no tab bar)', () => {
    const first = renderWithProviders(
      <Screen edges={['top']} footer={<RNText>F1</RNText>}>
        <RNText>x</RNText>
      </Screen>,
    );
    const pad = (text: string) => {
      let n = screen.getByText(text).parent;
      while (n && flat(n).borderTopWidth === undefined) n = n.parent;
      return flat(n!).paddingBottom as number;
    };
    const withInset = pad('F1');
    first.unmount();
    renderWithProviders(
      <Screen edges={['top', 'bottom']} footer={<RNText>F2</RNText>}>
        <RNText>x</RNText>
      </Screen>,
    );
    expect(pad('F2')).toBe(12);
    expect(withInset).toBe(12 + 34); // test insets.bottom = 34
  });
});

describe('keyboard hooks', () => {
  const handlers = new Map<string, ((e: object) => void)[]>();
  beforeEach(() => {
    handlers.clear();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (e: object) => void) => {
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
      return { remove: () => handlers.set(name, (handlers.get(name) ?? []).filter((h) => h !== fn)) };
    }) as never);
  });
  const emit = (name: string, e: object) => act(() => void (handlers.get(name) ?? []).forEach((h) => h(e)));
  const evt = Platform.OS === 'ios' ? { show: 'keyboardWillShow', hide: 'keyboardWillHide' } : { show: 'keyboardDidShow', hide: 'keyboardDidHide' };

  it('useKeyboardOpen follows keyboardDidShow/Hide', () => {
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);
    emit('keyboardDidShow', { endCoordinates: { height: 300, screenY: 500 } });
    expect(result.current).toBe(true);
    emit('keyboardDidHide', {});
    expect(result.current).toBe(false);
  });

  it('useKeyboardOverlap measures the view against the keyboard top edge (no lift when already above it)', () => {
    const { result } = renderHook(() => useKeyboardOverlap());
    expect(result.current.overlap).toBe(0);
    const at = (y: number, h: number) => ({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, y, 390, h) });
    (result.current.ref as { current: unknown }).current = at(100, 600); // bottom at 700
    emit(evt.show, { endCoordinates: { height: 300, screenY: 544 } });
    expect(result.current.overlap).toBe(156);
    emit(evt.hide, {});
    expect(result.current.overlap).toBe(0);
    (result.current.ref as { current: unknown }).current = at(0, 500); // window already resized: bottom above keyboard
    emit(evt.show, { endCoordinates: { height: 300, screenY: 544 } });
    expect(result.current.overlap).toBe(0);
  });
});

describe('useReducedMotion', () => {
  it('turns true when the OS reports reduce motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0)); // let every hook's isReduceMotionEnabled() promise settle inside act
    });
    expect(result.current).toBe(true);
  });

  it('BottomSheet drops the slide animation under reduce motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    renderWithProviders(
      <BottomSheet visible title="S" onClose={() => undefined}>
        <Skeleton height={10} />
      </BottomSheet>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0)); // let every hook's isReduceMotionEnabled() promise settle inside act
    });
    expect(screen.UNSAFE_getByType(Modal).props.animationType).toBe('none');
  });
});

describe('Skeleton pulse ref counting', () => {
  const realEnv = process.env.JEST_WORKER_ID;
  afterEach(() => {
    process.env.JEST_WORKER_ID = realEnv;
  });

  it('starts one loop for many skeletons and stops it when the last one unmounts', () => {
    delete process.env.JEST_WORKER_ID; // animations on
    const stop = jest.fn();
    const start = jest.fn();
    const loop = jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset: jest.fn() } as never);
    const a = renderWithProviders(<Skeleton />);
    const b = renderWithProviders(
      <View>
        <Skeleton />
      </View>,
    );
    expect(loop).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    a.unmount();
    expect(stop).not.toHaveBeenCalled();
    b.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('A7: Toast queue, announce, persistence, haptics', () => {
  function Harness() {
    const toast = useToast();
    return (
      <>
        <Button label="a" onPress={() => toast.show('Alpha', 'success')} />
        <Button label="b" onPress={() => toast.show('Bravo', 'info')} />
        <Button label="c" onPress={() => toast.show('Charlie', 'success')} />
        <Button label="d" onPress={() => toast.show('Delta', 'info')} />
        <Button label="e" onPress={() => toast.show('Echo', 'success')} />
        <Button label="err" onPress={() => toast.show('Broke', 'danger')} />
        <Button label="err2" onPress={() => toast.show('Broke again', 'danger')} />
      </>
    );
  }
  const press = (n: string) => fireEvent.press(screen.getByRole('button', { name: n }));

  it('non-danger toasts queue FIFO, one visible at a time, max 3 waiting (oldest dropped)', () => {
    jest.useFakeTimers();
    renderWithProviders(<Harness />);
    for (const n of ['a', 'b', 'c', 'd', 'e']) press(n); // Alpha visible; Bravo, Charlie, Delta, Echo wait -> Bravo dropped
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('Bravo')).toBeNull();
    act(() => void jest.advanceTimersByTime(3100));
    expect(screen.getByText('Charlie')).toBeTruthy();
    act(() => void jest.advanceTimersByTime(3100));
    expect(screen.getByText('Delta')).toBeTruthy();
    act(() => void jest.advanceTimersByTime(4100));
    expect(screen.getByText('Echo')).toBeTruthy();
  });

  it('an error takes the slot at once; queued errors go ahead of queued non-errors', () => {
    jest.useFakeTimers();
    renderWithProviders(<Harness />);
    press('a');
    press('b');
    press('err'); // preempts Alpha
    expect(screen.getByText('Broke')).toBeTruthy();
    press('err2');
    press('c');
    fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByText('Broke again')).toBeTruthy();
  });

  it('announces on iOS when a toast becomes visible and fires the error haptic', () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    renderWithProviders(<Harness />);
    press('a');
    expect(announce).toHaveBeenCalledWith('Alpha');
    press('err');
    expect(announce).toHaveBeenCalledWith('Broke');
    const haptics = jest.requireMock('expo-haptics') as { notificationAsync: jest.Mock };
    expect(haptics.notificationAsync).toHaveBeenCalledWith('error');
  });

  it('danger toasts persist while a screen reader is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    renderWithProviders(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0)); // let every hook's isReduceMotionEnabled() promise settle inside act
    });
    jest.useFakeTimers();
    press('err');
    act(() => void jest.advanceTimersByTime(60000));
    expect(screen.getByText('Broke')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Broke')).toBeNull();
  });
});

describe('Pilot fixes: toast text and announcements', () => {
  it('long danger text is never clipped (no line limit)', () => {
    jest.useFakeTimers();
    function Long() {
      const toast = useToast();
      return <Button label="go" onPress={() => toast.show('Could not save because the server said: ' + 'very long reason '.repeat(30), 'danger')} />;
    }
    renderWithProviders(<Long />);
    fireEvent.press(screen.getByRole('button', { name: 'go' }));
    const text = screen.getByText(/^Could not save because/);
    expect(text.props.numberOfLines).toBeUndefined();
  });

  it('a timer start announces ONCE: the toast does it (the hook no longer announces a second time)', () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    function T() {
      const toast = useToast();
      return <Button label="go" onPress={() => toast.show('Timer started', 'success')} />;
    }
    renderWithProviders(<T />);
    fireEvent.press(screen.getByRole('button', { name: 'go' }));
    expect(announce.mock.calls.filter((c) => c[0] === 'Timer started')).toHaveLength(1);
  });
});
