import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React, { useState } from 'react';
import { Alert } from 'react-native';

import {
  Avatar,
  Badge,
  Banner,
  BottomSheet,
  Button,
  Card,
  Chip,
  ChoiceChips,
  EmptyState,
  EntityCard,
  ErrorState,
  FlagLine,
  Icon,
  Input,
  KpiCard,
  ListRow,
  OptionRow,
  PriorityBadge,
  ProgressBar,
  ReadOnlyNotice,
  SegmentedControl,
  SkeletonCards,
  StatusBadge,
  TabStrip,
  Text,
  useToast,
} from '@/components/ui';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useThemeStore } from '@/theme/themeStore';
import { renderWithProviders } from '@/test/testUtils';

const flat = (node: { props: { style?: unknown } }) => Object.assign({}, ...[node.props.style].flat(5).filter(Boolean));

afterEach(() => {
  useThemeStore.setState({ mode: 'system' });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each(['light', 'dark'] as const)('primitives render in %s mode', (mode) => {
  beforeEach(() => useThemeStore.setState({ mode }));

  it('renders every primitive without throwing and keeps documented roles/labels', () => {
    renderWithProviders(
      <>
        <Button label="Save" onPress={() => undefined} />
        <Button label="Delete" variant="dangerOutline" onPress={() => undefined} />
        <Badge label="New" tone="success" icon="checkmark" />
        <StatusBadge label="In progress" color="#336699" />
        <PriorityBadge priority="HIGH" label="High" />
        <FlagLine label="Blocked" />
        <Card>
          <Text>inside</Text>
        </Card>
        <Avatar name="Aditya Jadhav" kind="qa" />
        <ProgressBar pct={40} label="Done" />
        <KpiCard label="Overdue" value={3} tone="danger" />
        <EmptyState title="Nothing" icon="checkmark-circle-outline" />
        <ErrorState message="boom" />
        <Banner message="careful" tone="warning" />
        <ReadOnlyNotice message="view only" />
        <Icon name="close" label="Close icon" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByLabelText('QA: Aditya Jadhav')).toBeTruthy();
    expect(screen.getByText('AJ')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Done' })).toBeTruthy();
    expect(screen.getByLabelText('Overdue: 3')).toBeTruthy();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.getByRole('image', { name: 'Close icon' })).toBeTruthy();
  });
});

describe('Text', () => {
  it('uses the system font + fontWeight until Inter is loaded, then the family per weight (no fontWeight)', () => {
    const first = render(
      <ThemeProvider>
        <Text weight="semibold">hi</Text>
      </ThemeProvider>,
    );
    let s = flat(screen.getByText('hi'));
    expect(s.fontWeight).toBe('600');
    expect(s.fontFamily).toBeUndefined();
    expect(s.fontSize).toBeGreaterThanOrEqual(12);
    first.unmount();
    render(
      <ThemeProvider fontsLoaded>
        <Text weight="semibold">hi</Text>
      </ThemeProvider>,
    );
    s = flat(screen.getByText('hi'));
    expect(s.fontFamily).toBe('Inter_600SemiBold');
    expect(s.fontWeight).toBeUndefined();
  });

  it('forwards maxFontScale and numeric', () => {
    renderWithProviders(
      <Text maxFontScale={1.15} numeric>
        12
      </Text>,
    );
    const n = screen.getByText('12');
    expect(n.props.maxFontSizeMultiplier).toBe(1.15);
    expect(flat(n).fontVariant).toEqual(['tabular-nums']);
  });
});

describe('Button', () => {
  it('keeps the visible label static and puts the object in the accessible name', () => {
    const onPress = jest.fn();
    renderWithProviders(<Button label="Pass" accessibilityLabel="Pass Login form" onPress={onPress} />);
    expect(screen.getByText('Pass')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Pass Login form' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('compact is 36dp with a hitSlop that restores 44dp; icon-only keeps its name and hides the label', () => {
    renderWithProviders(
      <>
        <Button label="Go" size="compact" onPress={() => undefined} />
        <Button label="Next" iconOnly icon="chevron-forward" accessibilityLabel="Next day" onPress={() => undefined} />
      </>,
    );
    const go = screen.getByRole('button', { name: 'Go' });
    expect(flat(go).minHeight).toBe(36);
    expect(go.props.hitSlop).toEqual({ top: 4, bottom: 4 });
    expect(screen.queryByText('Next')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeTruthy();
  });

  it('loading is busy + disabled, shows a spinner and does not fire', () => {
    renderWithProviders(<Button label="Save" loading onPress={() => undefined} />);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(b.props.onPress).toBeUndefined();
  });
});

describe('Input', () => {
  it('shows (optional) visually while the accessible name stays the label; counter appears at 80%', () => {
    renderWithProviders(<Input label="Note" optional value={'x'.repeat(9)} maxLength={10} counter onChangeText={() => undefined} />);
    expect(screen.getByLabelText('Note')).toBeTruthy();
    expect(screen.getByText('(optional)')).toBeTruthy();
    expect(screen.getByText('9/10')).toBeTruthy();
  });

  it('hides the counter below 80% and shows error text with the field hint', () => {
    renderWithProviders(<Input label="Title" value="ab" maxLength={10} counter error="Required" onChangeText={() => undefined} />);
    expect(screen.queryByText('2/10')).toBeNull();
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.getByLabelText('Title').props.accessibilityHint).toBe('Required');
  });

  it('multiline fields get a taller minimum height', () => {
    renderWithProviders(<Input label="Body" multiline value="" onChangeText={() => undefined} />);
    expect(screen.getByLabelText('Body')).toBeTruthy();
  });
});

describe('selection controls', () => {
  it('Chip is a toggle button; ChoiceChips is a radiogroup of radios; TabStrip is a tablist of tabs', () => {
    const onChip = jest.fn();
    const onChoice = jest.fn();
    const onTab = jest.fn();
    renderWithProviders(
      <>
        <Chip label="Mine" selected onPress={onChip} />
        <ChoiceChips
          accessibilityLabel="Severity"
          value="a"
          onChange={onChoice}
          options={[
            { value: 'a', label: 'High' },
            { value: 'b', label: 'Low' },
          ]}
        />
        <TabStrip
          tabs={[
            { key: 'one', label: 'One' },
            { key: 'two', label: 'Two', badge: 3 },
          ]}
          value="one"
          onChange={onTab}
        />
        <SegmentedControl
          options={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
          ]}
          value="x"
          onChange={() => undefined}
        />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Mine' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Severity')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'High' }).props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByRole('radio', { name: 'Low' }));
    expect(onChoice).toHaveBeenCalledWith('b');
    expect(screen.getByRole('tab', { name: 'One' }).props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByRole('tab', { name: 'Two, 3' }));
    expect(onTab).toHaveBeenCalledWith('two');
  });

  it('OptionRow is a radio that says "Selected" in text (not only a glyph)', () => {
    renderWithProviders(
      <>
        <OptionRow label="Alpha" selected onPress={() => undefined} />
        <OptionRow label="Beta" selected={false} onPress={() => undefined} />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' }).props.accessibilityState).toMatchObject({ selected: true });
    // The word is visible but hidden from screen readers (the radio state says it once).
    expect(screen.getAllByText('Selected', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.queryByText('Selected')).toBeNull();
  });

  it('ListRow and EntityCard expose one pressable with the given name', () => {
    const open = jest.fn();
    renderWithProviders(
      <>
        <ListRow title="Row title" subtitle="sub" accessibilityLabel="Open row" onPress={open} chevron />
        <EntityCard title="Card title" accessibilityLabel="Open card" onPress={open} footer={<Button label="Act" onPress={() => undefined} />} />
      </>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Open row' }));
    fireEvent.press(screen.getByRole('button', { name: 'Open card' }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Act' })).toBeTruthy();
  });
});

describe('indicators', () => {
  it('ProgressBar neutral ignores completion colours; value is clamped', () => {
    renderWithProviders(
      <>
        <ProgressBar pct={90} label="neutral" semantic="neutral" markerPct={50} />
        <ProgressBar pct={150} label="clamped" />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: 'clamped' }).props.accessibilityValue).toMatchObject({ now: 100 });
    expect(screen.getByRole('progressbar', { name: 'neutral' }).props.accessibilityValue).toMatchObject({ now: 90 });
  });

  it('neutral ProgressBar is never the green/amber completion colour, even at 90% (burndown must not look "good" when much is left)', () => {
    renderWithProviders(
      <>
        <ProgressBar pct={90} label="done" />
        <ProgressBar pct={90} label="burn" semantic="neutral" />
      </>,
    );
    const fill = (name: string) => flat(screen.getByRole('progressbar', { name }).children[0] as never).backgroundColor;
    const done = fill('done');
    const burn = fill('burn');
    expect(done).not.toBe(burn);
    expect(burn).toBe('rgb(99, 102, 241)'); // brand 500 (light)
  });

  it('KpiCard with info opens an explainer sheet named About {label}', () => {
    renderWithProviders(<KpiCard label="Overdue" value={4} info="Counts tasks due today too." />);
    fireEvent.press(screen.getByRole('button', { name: 'About Overdue' }));
    expect(screen.getByText('Counts tasks due today too.')).toBeTruthy();
  });

  it('Skeleton exposes the same progressbar role + label + text the spinner had', () => {
    renderWithProviders(<SkeletonCards label="Loading tasks..." variant="task" count={2} />);
    expect(screen.getByRole('progressbar', { name: 'Loading tasks...' })).toBeTruthy();
    expect(screen.getByText('Loading tasks...')).toBeTruthy();
  });

  it('EmptyState and ErrorState offer actions', () => {
    const go = jest.fn();
    const retry = jest.fn();
    renderWithProviders(
      <>
        <EmptyState title="No tasks yet" action={{ label: 'Go to Tasks', onPress: go }} />
        <ErrorState message="boom" onRetry={retry} />
      </>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Go to Tasks' }));
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(go).toHaveBeenCalled();
    expect(retry).toHaveBeenCalled();
  });

  it('Banner with an action keeps the message as the alert and the action focusable', () => {
    const act1 = jest.fn();
    renderWithProviders(<Banner message="Offline" tone="warning" action={{ label: 'Retry', onPress: act1 }} />);
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(act1).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

function SheetHarness({ kind, dirty }: { kind?: 'picker' | 'form'; dirty?: boolean }) {
  const [open, setOpen] = useState(true);
  const toast = useToast();
  return (
    <>
      <Button label="Toast" onPress={() => toast.show('Saved it', 'success')} />
      <BottomSheet
        visible={open}
        kind={kind}
        dirty={dirty}
        title="Pick one"
        onClose={() => setOpen(false)}
        footer={kind === 'form' ? <Button label="Save" onPress={() => undefined} /> : undefined}
      >
        <Text>body</Text>
      </BottomSheet>
      {open ? null : <Text>closed</Text>}
    </>
  );
}

describe('BottomSheet', () => {
  it('picker: trailing "Close" (name Close {title}); closes', () => {
    renderWithProviders(<SheetHarness />);
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.getByText('Close')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Close Pick one' }));
    expect(screen.getByText('closed')).toBeTruthy();
  });

  it('form: leading Cancel, sticky footer, and a discard confirmation only when dirty', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { unmount } = renderWithProviders(<SheetHarness kind="form" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel Pick one' }));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText('closed')).toBeTruthy();
    unmount();

    renderWithProviders(<SheetHarness kind="form" dirty />);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel Pick one' }));
    expect(alert).toHaveBeenCalledWith('Discard changes?', expect.any(String), expect.any(Array));
    expect(screen.queryByText('closed')).toBeNull(); // still open until the user confirms
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find((b) => b.text === 'Discard')!.onPress!());
    expect(screen.getByText('closed')).toBeTruthy();
  });

  it('a toast raised while the sheet is open renders inside the sheet', () => {
    renderWithProviders(<SheetHarness />);
    fireEvent.press(screen.getByRole('button', { name: 'Toast' }));
    expect(screen.getByText('Saved it')).toBeTruthy();
  });
});

function ToastHarness() {
  const toast = useToast();
  return (
    <>
      <Button label="ok" onPress={() => toast.show('Fine', 'success')} />
      <Button label="bad" onPress={() => toast.show('Broke', 'danger')} />
      <Button label="info" onPress={() => toast.show('FYI', 'info')} />
      <Button label="dismiss-api" onPress={() => toast.dismiss()} />
    </>
  );
}

describe('Toast', () => {
  it('success disappears after 3s; danger lasts at least 8s and is announced assertively', () => {
    jest.useFakeTimers();
    renderWithProviders(<ToastHarness />);
    fireEvent.press(screen.getByRole('button', { name: 'ok' }));
    expect(screen.getByText('Fine')).toBeTruthy();
    act(() => void jest.advanceTimersByTime(3100));
    expect(screen.queryByText('Fine')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'bad' }));
    expect(screen.getByText('Broke')).toBeTruthy();
    expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe('assertive');
    act(() => void jest.advanceTimersByTime(7900));
    expect(screen.getByText('Broke')).toBeTruthy();
    act(() => void jest.advanceTimersByTime(300));
    expect(screen.queryByText('Broke')).toBeNull();
  });

  it('has a Dismiss button; a danger toast is not displaced by a later success toast (queued behind)', () => {
    jest.useFakeTimers();
    renderWithProviders(<ToastHarness />);
    fireEvent.press(screen.getByRole('button', { name: 'bad' }));
    fireEvent.press(screen.getByRole('button', { name: 'ok' }));
    expect(screen.getByText('Broke')).toBeTruthy();
    expect(screen.queryByText('Fine')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByText('Fine')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Fine')).toBeNull();
  });

  it('collapses an identical message shown again within 1.5s', () => {
    jest.useFakeTimers();
    renderWithProviders(<ToastHarness />);
    fireEvent.press(screen.getByRole('button', { name: 'info' }));
    fireEvent.press(screen.getByRole('button', { name: 'info' }));
    expect(screen.getAllByText('FYI')).toHaveLength(1);
  });
});
