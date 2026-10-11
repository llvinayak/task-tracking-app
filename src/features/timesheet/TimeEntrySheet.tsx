import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import type { Task } from '@/api/models';
import { validateEntry, NOTE_MAX, type TimesheetEntry } from '@/api/timesheetApi';
import { BottomSheet, Banner, Button, ChoiceChips, ErrorState, Icon, Input, LoadingState, Text } from '@/components/ui';
import { captureSession } from '@/hooks/sessionMutation';
import { useTimeEntryMutations, useTimeTaskPicker } from '@/hooks/timesheet';
import { useDebounced } from '@/hooks/useDebounced';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';
import { timezonesDiffer, utcMsToWall } from '@/utils/companyTime';
import { formatDuration } from '@/utils/time';
import { taskCode } from '@/utils/taskUtils';
import { addDaysToDateString, formatDateLabel, isValidDateString } from '@/utils/dates';
import { isHHmm, maskDate, maskTime, shiftHHmm } from '@/utils/timeInput';

/** -15 / +15 minute nudges for a typed HH:mm value (clamped to the day; disabled until the value is valid). */
function NudgeRow({ value, onChange, what }: { value: string; onChange: (v: string) => void; what: string }) {
  const ok = isHHmm(value);
  return (
    <View style={styles.nudge}>
      <Button label="-15" accessibilityLabel={`-15 minutes, ${what}`} variant="secondary" size="compact" fullWidth={false} disabled={!ok} onPress={() => onChange(shiftHHmm(value, -15))} />
      <Button label="+15" accessibilityLabel={`+15 minutes, ${what}`} variant="secondary" size="compact" fullWidth={false} disabled={!ok} onPress={() => onChange(shiftHHmm(value, 15))} />
    </View>
  );
}

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Add or edit one time entry. Dates and times are COMPANY time (the server's
 * timezone for bucketing days); a banner says so, and warns when the device
 * zone differs. Without a known company zone the device zone is used, loudly.
 */
export function TimeEntrySheet({
  visible,
  onClose,
  timezone,
  defaultDate,
  todayDate,
  entry,
}: {
  visible: boolean;
  onClose: () => void;
  timezone: string | null;
  defaultDate: string;
  /** Company "today" (yyyy-MM-dd) for the Today / Yesterday presets; omitted = no presets. */
  todayDate?: string;
  entry?: TimesheetEntry | null;
}) {
  const t = useTheme();
  const me = useAuthStore((s) => s.user);
  const { create, update, remove, confirm } = useTimeEntryMutations();
  const tz = timezone ?? deviceZone();
  // The seed effect must NOT re-run when the zone arrives late, or it would wipe what the user typed.
  // It reads the zone through a ref; submit re-derives everything from the CURRENT zone.
  const tzRef = useRef(tz);
  tzRef.current = tz;
  /** The zone the start/end texts are currently expressed in. */
  const inputZone = useRef(tz);
  const editing = !!entry;

  const [task, setTask] = useState<{ id: number; label: string } | null>(null);
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  /** What the entry looked like when the sheet opened: times are only validated/sent when they differ. */
  const [orig, setOrig] = useState<{ date: string; start: string; end: string } | null>(null);
  const [crossesMidnight, setCrossesMidnight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<'mine' | 'all'>('mine');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);

  // (Re)seed the form whenever the sheet opens (NOT when the timezone changes: see tzRef).
  useEffect(() => {
    if (!visible) return;
    const zone = tzRef.current;
    inputZone.current = zone;
    setError(null);
    setPicking(false);
    setSearch('');
    if (entry) {
      const s = entry.started_at ? utcMsToWall(Date.parse(entry.started_at), zone) : null;
      const e = entry.ended_at ? utcMsToWall(Date.parse(entry.ended_at), zone) : null;
      const seeded = { date: s?.date ?? defaultDate, start: s?.time ?? '', end: e?.time ?? '' };
      setTask({ id: entry.task_id, label: entry.task_title });
      setDate(seeded.date);
      setStart(seeded.start);
      setEnd(seeded.end);
      setNote(entry.note);
      setOrig(seeded);
      // Overnight (or open) entries cannot be written as one day's HH:mm pair: their times stay as they are.
      setCrossesMidnight(!s || !e || e.date !== s.date);
    } else {
      setTask(null);
      setDate(defaultDate);
      setStart('');
      setEnd('');
      setNote('');
      setOrig(null);
      setCrossesMidnight(false);
    }
  }, [visible, entry, defaultDate]);

  // The company zone can arrive (or change) after the user already typed times. Times typed under
  // the old zone must never be silently re-read in the new one: edits are re-derived from the entry
  // in the company zone (the note stays), new entries clear start/end, and the user is told.
  useEffect(() => {
    if (!visible || inputZone.current === tz) return;
    inputZone.current = tz;
    const touched = entry ? date !== orig?.date || start !== orig?.start || end !== orig?.end : start !== '' || end !== '';
    if (!touched) {
      if (entry) {
        const s0 = entry.started_at ? utcMsToWall(Date.parse(entry.started_at), tz) : null;
        const e0 = entry.ended_at ? utcMsToWall(Date.parse(entry.ended_at), tz) : null;
        const seeded = { date: s0?.date ?? defaultDate, start: s0?.time ?? '', end: e0?.time ?? '' };
        setDate(seeded.date);
        setStart(seeded.start);
        setEnd(seeded.end);
        setOrig(seeded);
        setCrossesMidnight(!s0 || !e0 || e0.date !== s0.date);
      }
      return;
    }
    if (entry) {
      const s0 = entry.started_at ? utcMsToWall(Date.parse(entry.started_at), tz) : null;
      const e0 = entry.ended_at ? utcMsToWall(Date.parse(entry.ended_at), tz) : null;
      const seeded = { date: s0?.date ?? defaultDate, start: s0?.time ?? '', end: e0?.time ?? '' };
      setDate(seeded.date);
      setStart(seeded.start);
      setEnd(seeded.end);
      setOrig(seeded);
      setCrossesMidnight(!s0 || !e0 || e0.date !== s0.date);
    } else {
      setStart('');
      setEnd('');
    }
    setError(`The company timezone is now ${tz}. Times you typed before it was known were cleared; enter them again in company time.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz, visible]);

  const tasks = useTimeTaskPicker(mode, debounced, me?.id, visible && picking);
  const mismatch = useMemo(() => timezonesDiffer(tz, Date.now()), [tz]);
  const busy = create.isPending || update.isPending || remove.isPending || confirm.isPending;
  const timesChanged = !!orig && (date !== orig.date || start !== orig.start || end !== orig.end);
  const needsConfirm = !!entry && entry.auto_closed && !entry.reviewed_at;
  // Anything the user changed since the sheet opened (Cancel / back then asks before discarding).
  const dirty = entry
    ? timesChanged || note !== entry.note
    : !!task || start !== '' || end !== '' || note !== '' || date !== defaultDate;

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!task) {
      setError('Pick a task first.');
      return;
    }
    const alive = captureSession();
    try {
      if (entry) {
        if (timesChanged && !crossesMidnight) {
          // Times are validated ONLY when the user changed them.
          const v = validateEntry({ date, start, end, note }, tzRef.current);
          if (!v.ok) {
            setError(v.error);
            return;
          }
          await update.mutateAsync({ id: entry.id, taskId: task.id, startedAt: v.startedAt, endedAt: v.endedAt, note });
        } else {
          if (note.length > NOTE_MAX) {
            setError(`Keep the note under ${NOTE_MAX} characters.`);
            return;
          }
          await update.mutateAsync({ id: entry.id, taskId: task.id, note }); // note only: the server keeps the times
        }
      } else {
        const v = validateEntry({ date, start, end, note }, tzRef.current);
        if (!v.ok) {
          setError(v.error);
          return;
        }
        await create.mutateAsync({ taskId: task.id, startedAt: v.startedAt, endedAt: v.endedAt, note });
      }
      if (!alive()) return;
      onClose();
    } catch (e) {
      if (!alive()) return;
      setError(getErrorMessage(e)); // 403 not assigned / 409 overlap / 400 cap, future: verbatim
    }
  };

  const doConfirm = async () => {
    if (!entry || busy) return;
    setError(null);
    const alive = captureSession();
    try {
      await confirm.mutateAsync({ id: entry.id, taskId: entry.task_id });
      if (!alive()) return;
      onClose();
    } catch (e) {
      if (!alive()) return;
      setError(getErrorMessage(e));
    }
  };

  const confirmDelete = () => {
    if (!entry || busy) return;
    Alert.alert('Delete this entry?', `${entry.task_title} · ${formatDuration(entry.minutes)} will be removed from your time.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const alive = captureSession();
          remove.mutate(
            { id: entry.id, taskId: entry.task_id },
            {
              onSuccess: () => {
                if (alive()) onClose();
              },
              onError: (e) => {
                if (alive()) setError(getErrorMessage(e));
              },
            },
          );
        },
      },
    ]);
  };

  const preview = useMemo(() => {
    if (crossesMidnight) return null;
    const v = validateEntry({ date, start, end }, tz);
    return v.ok ? v : null;
  }, [date, start, end, tz, crossesMidnight]);

  // The error sits in the footer, right above the buttons: it stays visible however far the form is scrolled.
  const sheetFooter = (
    <>
      {error ? <Banner message={error} testID="entry-error" /> : null}
      <View style={styles.footerRow}>
        <Button
          label={editing ? 'Save entry' : 'Add entry'}
          style={styles.flex1}
          onPress={() => void submit()}
          loading={create.isPending || update.isPending}
          disabled={busy}
        />
        {editing ? (
          <Button label="Delete entry" variant="dangerOutline" size="compact" inline onPress={confirmDelete} loading={remove.isPending} disabled={busy} />
        ) : null}
      </View>
    </>
  );

  return (
    <BottomSheet
      visible={visible}
      kind="form"
      scroll={!picking}
      dirty={dirty && !picking}
      title={editing ? 'Edit time entry' : 'Add time'}
      onClose={onClose}
      footer={picking ? undefined : sheetFooter}
    >
      {picking ? (
        <View style={[styles.body, styles.pickerBody]}>
          <ChoiceChips
            accessibilityLabel="Task list"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'mine', label: 'Assigned to me' },
              { value: 'all', label: 'All tasks' },
            ]}
          />
          <Input label="Search tasks" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
          {mode === 'all' ? (
            <Text size="xs" tone="muted">
              You can only log time on tasks you are assigned to. The server will say so if you pick another.
            </Text>
          ) : null}
          {tasks.isFetching && !tasks.data ? <LoadingState label="Loading tasks..." /> : null}
          {tasks.isError ? <ErrorState message={getErrorMessage(tasks.error)} onRetry={() => void tasks.refetch()} /> : null}
          {mode === 'all' && debounced.trim().length < 2 ? <Text tone="muted">Type at least 2 characters.</Text> : null}
          {tasks.data && tasks.data.length === 0 ? <Text tone="muted">No tasks found.</Text> : null}
          <FlatList
            data={tasks.data ?? []}
            keyExtractor={(x: Task) => String(x.id)}
            style={styles.pickerList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setTask({ id: item.id, label: item.title });
                  setPicking(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${item.title}`}
                style={[styles.taskRow, { minHeight: t.minTouch, borderBottomColor: t.colors.lineFaint }]}
              >
                <Text weight="medium" numberOfLines={2}>
                  {item.title}
                </Text>
                <Text size="2xs" tone="subtle">
                  {taskCode(item)}
                </Text>
              </Pressable>
            )}
          />
          <Button label="Back" variant="ghost" onPress={() => setPicking(false)} />
        </View>
      ) : (
        <View style={styles.body}>
          {/* A banner only when there is something to warn about; otherwise a quiet helper line. */}
          {mismatch || !timezone ? (
            <Banner
              tone="warning"
              testID="tz-banner"
              message={
                timezone
                  ? `Times are in company time (${timezone}), which differs from your device's timezone. Enter company time.`
                  : "The company timezone is not known yet, so your device's timezone is used."
              }
            />
          ) : (
            <Text size="xs" tone="muted" testID="tz-banner">
              {`Times are in company time (${timezone}).`}
            </Text>
          )}

          <View style={styles.field}>
            <Text size="sm" weight="medium" tone="muted">
              Task
            </Text>
            <Pressable
              disabled={editing}
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel={task ? `Task: ${task.label}${editing ? '' : '. Change task'}` : 'Choose a task'}
              style={[styles.select, { minHeight: t.minTouch, borderColor: t.colors.fieldBorder, borderRadius: t.radius.xl, backgroundColor: editing ? t.colors.subtle : t.colors.surface }]}
            >
              <Text style={[styles.flex1, !task && { color: t.colors.placeholder }]} numberOfLines={2}>
                {task?.label ?? 'Choose a task'}
              </Text>
              {editing ? null : <Icon name="chevron-down" size={20} tone="subtle" />}
            </Pressable>
          </View>

          <View style={styles.field}>
            <Input
              label="Date (yyyy-MM-dd)"
              value={date}
              onChangeText={(v) => setDate(maskDate(v))}
              editable={!crossesMidnight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="2026-10-10"
              helper="Type the digits only; the dashes are added for you."
            />
            <View style={styles.presetRow}>
              <Text size="sm" tone="muted" testID="date-weekday" style={styles.flex1}>
                {isValidDateString(date) ? formatDateLabel(date) : 'Not a valid date yet'}
              </Text>
              {todayDate && !crossesMidnight ? (
                <>
                  <Button label="Today" variant="secondary" size="compact" fullWidth={false} inline onPress={() => setDate(todayDate)} />
                  <Button
                    label="Yesterday"
                    variant="secondary"
                    size="compact"
                    fullWidth={false}
                    inline
                    onPress={() => setDate(addDaysToDateString(todayDate, -1))}
                  />
                </>
              ) : null}
            </View>
          </View>
          <View style={styles.times}>
            <View style={styles.flex1}>
              <Input
                label="Start (HH:mm)"
                value={start}
                onChangeText={(v) => setStart(maskTime(v))}
                editable={!crossesMidnight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                maxLength={5}
                placeholder="09:30"
              />
              {!crossesMidnight ? <NudgeRow value={start} onChange={setStart} what="start time" /> : null}
            </View>
            <View style={styles.flex1}>
              <Input
                label="End (HH:mm)"
                value={end}
                onChangeText={(v) => setEnd(maskTime(v))}
                editable={!crossesMidnight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                maxLength={5}
                placeholder="11:00"
              />
              {!crossesMidnight ? <NudgeRow value={end} onChange={setEnd} what="end time" /> : null}
            </View>
          </View>
          {!crossesMidnight ? (
            <Text size="xs" tone="muted">
              Type 4 digits for a time, e.g. 0930.
            </Text>
          ) : null}
          {crossesMidnight ? (
            <Text size="xs" tone="muted" testID="overnight-hint">
              This entry runs past midnight (or is still open), so its times cannot be changed here. You can still edit the note or confirm it.
            </Text>
          ) : null}
          {!editing ? (
            <Text size="xs" tone="muted" testID="same-day-hint">
              A new entry must start and end on the same day. For work past midnight, add one entry for each day.
            </Text>
          ) : null}
          {preview ? (
            <Text size="xs" tone="muted" testID="entry-preview">
              {formatDuration(preview.minutes)}
              {preview.longEntryHint ? ' · The server may reject a single entry this long.' : ''}
            </Text>
          ) : null}
          <Input label="Note (optional)" value={note} onChangeText={setNote} multiline numberOfLinesMin={2} maxLength={NOTE_MAX} counter />
          {needsConfirm ? (
            <>
              <Text size="xs" tone="muted">
                Saving an auto-closed entry marks it as reviewed.
              </Text>
              <Button label="Confirm entry as correct" variant="secondary" onPress={() => void doConfirm()} loading={confirm.isPending} disabled={busy} />
            </>
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  body: { padding: 16, gap: 12 },
  // The picker shrinks with the sheet (and the keyboard) instead of a fixed 320dp list.
  pickerBody: { flexShrink: 1 },
  pickerList: { flexShrink: 1 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { gap: 8 },
  select: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 12 },
  times: { flexDirection: 'row', gap: 8 },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nudge: { flexDirection: 'row', gap: 8, marginTop: 4 },
  taskRow: { justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
});
