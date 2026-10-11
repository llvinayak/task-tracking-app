import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, StyleSheet, TextInput, View } from 'react-native';

import { getDailyReport, type DailyReport, type DayItem } from '@/api/dailyReportApi';
import { getErrorMessage } from '@/api/errors';
import {
  Badge,
  Banner,
  Button,
  Card,
  Dot,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  StaleBanner,
  Text,
  useToast,
} from '@/components/ui';
import {
  dailyKeys,
  useDailyReport,
  useReviewEntry,
  useSaveDay,
  useSubmitDay,
  useUnreviewedEntries,
} from '@/hooks/dailyReport';
import { captureSession } from '@/hooks/sessionMutation';
import { useTodayKey } from '@/hooks/useToday';
import { useDirtyGuard } from '@/store/uiStores';
import { useTheme } from '@/theme/ThemeProvider';
import { addDaysToDateString, formatDateLabel, formatDateTime } from '@/utils/dates';
import { formatDuration } from '@/utils/time';

import {
  MAX_NOTE,
  MAX_TEXT,
  buildForm,
  groupByProject,
  isDirty,
  mergeServerIntoForm,
  partsFromMinutes,
  toSaveBody,
  validateParts,
  varianceLabel,
  type DayForm,
} from './dayForm';

/** A day older than this is re-fetched when the tab regains focus. */
export const FOCUS_STALE_MS = 30_000;

/** True when a day fetched at `updatedAt` is old enough to refetch on tab focus. */
export const isStaleForFocus = (updatedAt: number, now: number = Date.now()) => updatedAt > 0 && now - updatedAt > FOCUS_STALE_MS;

/* ── Minutes editor ──────────────────────────────────────────────────────── */

function MinutesEditor({
  id,
  title,
  minutes,
  disabled,
  onChange,
  onError,
}: {
  /** Stable identity (DayItem.key) used when reporting errors. */
  id: string;
  title: string;
  minutes: number;
  disabled: boolean;
  onChange: (minutes: number) => void;
  /** Reports the current error (or null) so the screen can block Save/Submit. Must be stable. */
  onError: (id: string, message: string | null) => void;
}) {
  const t = useTheme();
  const parts = partsFromMinutes(minutes);
  const [h, setH] = useState(String(parts.hours));
  const [m, setM] = useState(String(parts.minutes));
  const [error, setError] = useState<string | null>(null);

  // Follow external changes (save / reload) without fighting the user's typing.
  const last = useRef(minutes);
  useEffect(() => {
    if (minutes !== last.current) {
      const p = partsFromMinutes(minutes);
      setH(String(p.hours));
      setM(String(p.minutes));
      setError(null);
      onError(id, null);
      last.current = minutes;
    }
  }, [minutes, onError, id]);
  // A removed editor must not leave a stale error behind.
  useEffect(() => () => onError(id, null), [onError, id]);

  const commit = (hText: string, mText: string) => {
    const r = validateParts(hText, mText);
    if ('error' in r) {
      setError(r.error);
      onError(id, r.error);
      return;
    }
    setError(null);
    onError(id, null);
    last.current = r.minutes;
    onChange(r.minutes);
  };

  const field = (label: 'Hours' | 'Minutes', value: string, set: (v: string) => void) => (
    <View style={styles.numWrap}>
      <TextInput
        accessibilityLabel={`${label} for ${title}`}
        value={value}
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={3}
        selectTextOnFocus
        onChangeText={(v) => {
          const clean = v.replace(/[^0-9]/g, '');
          set(clean);
          commit(label === 'Hours' ? clean : h, label === 'Minutes' ? clean : m);
        }}
        style={[
          styles.num,
          {
            minHeight: t.minTouch,
            minWidth: t.minTouch + 8,
            color: t.colors.fg,
            borderColor: error ? t.colors.danger.base : t.colors.lineStrong,
            backgroundColor: disabled ? t.colors.subtle : t.colors.surface,
            borderRadius: t.radius.xl,
          },
        ]}
      />
      <Text size="xs" tone="muted">
        {label === 'Hours' ? 'h' : 'm'}
      </Text>
    </View>
  );

  return (
    <View>
      <View style={styles.numRow}>
        {field('Hours', h, setH)}
        {field('Minutes', m, setM)}
      </View>
      {error ? (
        <Text size="xs" tone="danger" accessibilityLiveRegion="polite" testID="minutes-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export function MyDayScreen() {
  const t = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const navigation = useNavigation();
  const setGuard = useDirtyGuard((s) => s.setDirty);

  /** null = today (default query, no date param: the server picks the company-timezone day). */
  const [selected, setSelected] = useState<string | null>(null);
  const [knownToday, setKnownToday] = useState<string | null>(null);

  const day = useDailyReport(selected);
  const report = day.data;
  const save = useSaveDay();
  const submit = useSubmitDay();

  /**
   * The day the form is bound to. It only changes through adopt(), never because
   * a query result for another day arrived: a draft stays on ITS date.
   */
  const [view, setView] = useState<DailyReport | null>(null);
  const [form, setForm] = useState<DayForm | null>(null);
  const [baseline, setBaseline] = useState<DayForm | null>(null);
  const viewRef = useRef<DailyReport | null>(null);
  const formRef = useRef<DayForm | null>(null);
  const baselineRef = useRef<DayForm | null>(null);
  viewRef.current = view;
  formRef.current = form;
  baselineRef.current = baseline;
  const [actionError, setActionError] = useState<string | null>(null);
  const [rolledDraftDate, setRolledDraftDate] = useState<string | null>(null);
  const [editorErrors, setEditorErrors] = useState<Record<string, string>>({});
  const [mergeNote, setMergeNote] = useState(false);
  /** True from the start of a save/submit's fresh GET: inputs are locked so nothing typed can be lost. */
  const [freshing, setFreshing] = useState(false);
  const freshRef = useRef(false);
  const [droppedNote, setDroppedNote] = useState<string | null>(null);

  const adopt = useCallback((r: DailyReport) => {
    const next = buildForm(r);
    if (viewRef.current && viewRef.current.date !== r.date) {
      setMergeNote(false); // the notes are about THIS day
      setDroppedNote(null);
    }
    viewRef.current = r;
    formRef.current = next;
    baselineRef.current = next;
    setView(r);
    setForm(next);
    setBaseline(next);
    setEditorErrors({});
  }, []);

  const noteDropped = (from: DailyReport, dropped: { key: string }[]) => {
    if (dropped.length === 0) return;
    const names = dropped.map((d) => from.items.find((i) => i.key === d.key)?.task_title ?? 'A line');
    const one = names.length === 1;
    setDroppedNote(`${names.join(', ')} ${one ? 'is' : 'are'} no longer on this day, so your edit to ${one ? 'it' : 'them'} was not saved.`);
  };

  // Learn today's date from the default query.
  useEffect(() => {
    if (selected === null && report) setKnownToday(report.date);
  }, [selected, report]);

  // Adopt server data.
  useEffect(() => {
    if (!report) return;
    const cur = viewRef.current;
    const f = formRef.current;
    const b = baselineRef.current;
    const dirtyNow = !!f && !!b && isDirty(f, b);

    if (!cur) {
      adopt(report);
      return;
    }
    if (report.date !== cur.date) {
      if (selected === null && dirtyNow) {
        // Midnight (company time) passed while a draft is open: keep the draft on
        // ITS date instead of swapping the form under the user's fingers.
        setKnownToday(report.date);
        setRolledDraftDate(cur.date);
        setSelected(cur.date);
        return;
      }
      adopt(report);
      return;
    }
    if (!dirtyNow || !f || !b) {
      adopt(report);
      return;
    }
    // Same day, user is editing: unedited lines take the server's newer values.
    const merged = mergeServerIntoForm(report, f, b);
    const base = buildForm(report);
    viewRef.current = report;
    formRef.current = merged.form;
    baselineRef.current = base;
    setView(report);
    setForm(merged.form);
    setBaseline(base);
    if (merged.changed) setMergeNote(true);
    noteDropped(cur, merged.dropped);
  }, [report, selected, adopt]);

  // The device calendar rolled over: re-ask the server what "today" is.
  const todayKey = useTodayKey();
  const firstKey = useRef(todayKey);
  useEffect(() => {
    if (todayKey === firstKey.current) return;
    firstKey.current = todayKey;
    void qc.invalidateQueries({ queryKey: dailyKeys.root });
    void qc.invalidateQueries({ queryKey: dailyKeys.pending });
  }, [todayKey, qc]);

  // Back on this tab: refresh a day that has been sitting for a while.
  useFocusEffect(
    useCallback(() => {
      if (isStaleForFocus(day.dataUpdatedAt)) void day.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day.dataUpdatedAt]),
  );

  const locked = view?.status === 'submitted';
  const dirty = isDirty(form, baseline);
  const focused = useIsFocused();
  useEffect(() => {
    setGuard(dirty && !locked && focused);
    return () => setGuard(false);
  }, [dirty, locked, focused, setGuard]);

  // "Discard" chosen in the tab-bar guard dialog: drop the edits for real.
  const discardSignal = useDirtyGuard((s) => s.discardSignal);
  const seenDiscard = useRef(discardSignal);
  useEffect(() => {
    if (discardSignal === seenDiscard.current) return;
    seenDiscard.current = discardSignal;
    if (viewRef.current) adopt(viewRef.current);
  }, [discardSignal, adopt]);

  const confirmDiscard = useCallback(
    (proceed: () => void) => {
      if (!dirty || locked) {
        proceed();
        return;
      }
      Alert.alert('Discard changes?', 'You have unsaved changes to this day.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: proceed },
      ]);
    },
    [dirty, locked],
  );

  // Android back while dirty: Discard resets the form AND lets back proceed.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!dirty || locked) return false;
        confirmDiscard(() => {
          if (viewRef.current) adopt(viewRef.current);
          setGuard(false);
          if (navigation.canGoBack()) navigation.goBack();
          else BackHandler.exitApp();
        });
        return true;
      });
      return () => sub.remove();
    }, [dirty, locked, confirmDiscard, adopt, navigation, setGuard]),
  );

  const busy = save.isPending || submit.isPending || freshing;
  const goToDate = (date: string | null) => {
    setActionError(null);
    setSelected(date);
  };

  const prev = () => {
    if (!view || busy) return;
    confirmDiscard(() => goToDate(addDaysToDateString(view.date, -1)));
  };
  // Future days are not allowed: Next/Today are disabled on (or after) today.
  const onToday = view !== null && knownToday !== null ? view.date >= knownToday : selected === null;
  const next = () => {
    if (!view || onToday || !knownToday || busy) return;
    const n = addDaysToDateString(view.date, 1);
    confirmDiscard(() => goToDate(n >= knownToday ? null : n));
  };
  const toToday = () => {
    if (busy) return;
    confirmDiscard(() => {
      setRolledDraftDate(null);
      goToDate(null);
    });
  };

  const needsReviewCount = view?.needsReview ?? 0;
  const unreviewed = useUnreviewedEntries(view?.date ?? null, needsReviewCount > 0 && !locked);
  const review = useReviewEntry(view?.date ?? '');

  const minutesOf = useCallback(
    (i: DayItem) => form?.items.find((x) => x.key === i.key)?.minutes ?? i.minutes,
    [form],
  );
  const total = useMemo(() => (view ? view.items.reduce((s, i) => s + minutesOf(i), 0) : 0), [view, minutesOf]);
  const groups = useMemo(() => (view ? groupByProject(view.items, minutesOf) : []), [view, minutesOf]);

  const setField = (patch: Partial<DayForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setItem = (key: string, patch: Partial<{ minutes: number; note: string }>) =>
    setForm((f) => (f ? { ...f, items: f.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) } : f));
  const setEditorError = useCallback((key: string, message: string | null) => {
    setEditorErrors((e) => {
      if (message === null) {
        if (!(key in e)) return e;
        const { [key]: _gone, ...rest } = e;
        return rest;
      }
      return e[key] === message ? e : { ...e, [key]: message };
    });
  }, []);
  const hasEditorErrors = Object.keys(editorErrors).length > 0;

  /**
   * Writes (save or submit) always start from a FRESH GET of the day, so newer
   * tracked time can never be overwritten by a cached copy. Unedited lines take
   * the server's values; the user's own edits win. If the fresh read fails, we
   * do not write.
   */
  const withFreshDay = async (
    action: (fresh: DailyReport, merged: DayForm, alive: () => boolean) => Promise<void>,
  ): Promise<void> => {
    const cur = viewRef.current;
    if (!cur || !formRef.current || !baselineRef.current || busy || freshRef.current) return;
    if (hasEditorErrors) return;
    setActionError(null);
    const date = cur.date;
    const alive = captureSession();
    freshRef.current = true;
    setFreshing(true); // lock the inputs while we read: edits typed now would race the merge
    try {
      const fresh = await qc.fetchQuery({
        queryKey: dailyKeys.day(selected),
        queryFn: () => getDailyReport(selected ?? undefined),
        staleTime: 0,
      });
      if (!alive()) return;
      if (fresh.date !== date) {
        setActionError('The day changed while you were editing. Review it, then try again.');
        return;
      }
      // Merge from the LATEST form/baseline (refs), not the values captured before the await.
      const f = formRef.current;
      const b = baselineRef.current;
      if (!f || !b) return;
      const merged = mergeServerIntoForm(fresh, f, b);
      if (merged.changed) setMergeNote(true);
      noteDropped(cur, merged.dropped);
      await action(fresh, merged.form, alive);
    } catch (e) {
      if (!alive()) return;
      // Keep the draft; show why (e.g. 409 "This day has been submitted...").
      setActionError(getErrorMessage(e));
    } finally {
      freshRef.current = false;
      setFreshing(false);
    }
  };

  /** Applies the result of a write ONLY if the screen is still on the day it was for. */
  const settle = (date: string, fresh: DailyReport, written: DayForm) => {
    if (viewRef.current?.date !== date) return; // navigated away meanwhile: leave the new day's state alone
    viewRef.current = fresh;
    formRef.current = written;
    baselineRef.current = written;
    setView(fresh);
    setForm(written);
    setBaseline(written);
  };

  const onSave = () =>
    withFreshDay(async (fresh, merged, alive) => {
      const date = fresh.date;
      await save.mutateAsync(toSaveBody(fresh, merged));
      if (!alive()) return; // signed out meanwhile: no settle, no toast
      settle(date, fresh, merged);
      if (viewRef.current?.date === date) toast.show('Draft saved', 'success');
    });

  const doSubmit = () =>
    withFreshDay(async (fresh, merged, alive) => {
      const date = fresh.date;
      const res = await submit.mutateAsync(toSaveBody(fresh, merged));
      if (!alive()) return;
      settle(date, fresh, merged);
      toast.show(res.message, 'success');
    });

  const onSubmit = () => {
    if (!view || !form || busy || hasEditorErrors) return;
    const tasks = new Set(view.items.map((i) => i.task_id ?? i.key)).size;
    Alert.alert(
      'Submit this day?',
      `Filing ${formatDuration(total)} across ${tasks} ${tasks === 1 ? 'task' : 'tasks'}. It locks after this. A manager can reopen it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: () => void doSubmit() },
      ],
    );
  };

  /* ── Render ─────────────────────────────────────────────────────────── */

  if (!view || !form) {
    if (day.isError) {
      return (
        <Screen edges={['top', 'left', 'right']}>
          <ErrorState
            message={getErrorMessage(day.error)}
            onRetry={() => void day.refetch()}
            {...(selected ? { secondary: { label: 'Back to today', onPress: () => goToDate(null) } } : {})}
          />
        </Screen>
      );
    }
    return (
      <Screen edges={['top', 'left', 'right']}>
        <LoadingState label="Loading your day..." />
      </Screen>
    );
  }

  const noItems = view.items.length === 0;
  const showRolled = rolledDraftDate !== null && knownToday !== null && view.date !== knownToday;

  return (
    <Screen scroll keyboardAvoiding edges={['top', 'left', 'right']} onRefresh={() => void day.refetch()} refreshing={day.isRefetching}>
      {day.isError ? <StaleBanner message={getErrorMessage(day.error)} /> : null}

      <View style={styles.header}>
        <Text size="2xl" weight="bold" accessibilityRole="header">
          My Day
        </Text>
        <View style={styles.row}>
          <Text weight="semibold" testID="day-date">
            {formatDateLabel(view.date)}
          </Text>
          <Badge label={locked ? 'Submitted' : 'Draft'} tone={locked ? 'success' : 'neutral'} />
        </View>
        <View style={styles.nav}>
          <Button label="Previous day" variant="secondary" fullWidth={false} disabled={busy} onPress={prev} />
          <Button label="Next day" variant="secondary" fullWidth={false} disabled={onToday || busy} onPress={next} />
          <Button label="Today" variant="secondary" fullWidth={false} disabled={onToday || busy} onPress={toToday} />
          <Button
            label="Timesheet"
            variant="ghost"
            fullWidth={false}
            onPress={() => (navigation as unknown as { navigate: (n: string) => void }).navigate('Timesheet')}
          />
        </View>
        <Text size="sm" tone="muted" testID="day-totals">
          Total {formatDuration(total)}
          {view.trackedMinutes !== total ? ` · tracked ${formatDuration(view.trackedMinutes)}` : ''}
        </Text>
      </View>

      {showRolled ? (
        <View style={styles.gap}>
          <Banner
            testID="rolled-banner"
            tone="warning"
            message={`A new day started. Your draft is for ${formatDateLabel(view.date)}. Save it, then go to today.`}
          />
        </View>
      ) : null}
      {droppedNote ? (
        <View style={styles.gap}>
          <Banner testID="dropped-note" tone="warning" message={droppedNote} />
        </View>
      ) : null}
      {mergeNote ? (
        <View style={styles.gap}>
          <Banner testID="merge-note" tone="info" message="Some lines were updated with newer tracked time. Your own edits were kept." />
        </View>
      ) : null}
      {locked ? (
        <Banner
          testID="locked-banner"
          tone="info"
          message={`Submitted${view.submitted_at ? `. Filed ${formatDateTime(view.submitted_at)}` : ''}. Ask a manager to reopen it.`}
        />
      ) : null}
      {view.reopened_at ? (
        <Text size="sm" tone="muted" testID="reopened-line" style={styles.gap}>
          Reopened by {view.reopened_by?.name ?? 'a manager'} on {formatDateTime(view.reopened_at)}
        </Text>
      ) : null}
      {actionError ? <Banner testID="day-error" message={actionError} /> : null}
      {hasEditorErrors ? (
        <View style={styles.gap}>
          <Banner testID="editor-errors" message="Fix the highlighted times before saving or submitting." />
        </View>
      ) : null}

      {needsReviewCount > 0 && !locked ? (
        <Card style={styles.card} testID="review-card">
          <Text weight="semibold">Confirm auto-closed entries</Text>
          <Text size="sm" tone="muted">
            {needsReviewCount} {needsReviewCount === 1 ? 'entry was' : 'entries were'} closed automatically. Confirm them before you submit.
          </Text>
          {unreviewed.isLoading ? <LoadingState label="Loading entries..." /> : null}
          {unreviewed.isError ? (
            <ErrorState message={getErrorMessage(unreviewed.error)} onRetry={() => void unreviewed.refetch()} />
          ) : null}
          {(unreviewed.data ?? []).map((e) => (
            <View key={e.id} style={styles.reviewRow} testID={`review-${e.id}`}>
              <View style={styles.flex1}>
                <Text weight="medium" numberOfLines={2}>
                  {e.task_title}
                </Text>
                <Text size="xs" tone="muted">
                  {formatDuration(e.minutes)} · auto-closed
                </Text>
              </View>
              <Button
                label={`Confirm ${e.task_title}`}
                fullWidth={false}
                variant="secondary"
                loading={review.isPending && review.variables === e.id}
                onPress={() => review.mutate(e.id, { onError: (err) => setActionError(getErrorMessage(err)) })}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {noItems ? (
        <EmptyState title="Nothing tracked yet" message="Start a timer on a task and it will show up here." />
      ) : (
        groups.map((g) => (
          <View key={g.key} style={styles.group} testID={`project-group-${g.key}`}>
            <View style={styles.row}>
              <Dot color={g.color} size={10} />
              <Text weight="semibold" style={styles.flex1}>
                {g.name}
              </Text>
              <Text weight="semibold">{formatDuration(g.minutes)}</Text>
            </View>
            {g.items.map((i) => {
              const fi = form.items.find((x) => x.key === i.key);
              const mins = fi?.minutes ?? i.minutes;
              const variance = varianceLabel(i, mins);
              const testKey = i.task_id ?? i.key;
              return (
                <Card key={i.key} style={styles.card} testID={`item-${testKey}`}>
                  <View style={styles.row}>
                    <Text weight="medium" style={styles.flex1} numberOfLines={2}>
                      {i.task_title}
                    </Text>
                    {i.readOnly ? <Badge label="Read-only" tone="neutral" /> : null}
                    {i.needs_review ? <Badge label="Auto-closed" tone="warning" /> : null}
                  </View>
                  <Text size="xs" tone="muted">
                    tracked {formatDuration(i.auto_minutes)}
                    {i.session_count > 1 ? ` · ${i.session_count} sessions` : ''}
                    {variance ? ` · ${variance}` : ''}
                  </Text>
                  {i.readOnly ? (
                    <>
                      <Text weight="semibold" testID={`readonly-minutes-${i.key}`}>
                        {formatDuration(i.minutes)}
                      </Text>
                      {i.note ? <Text size="sm">{i.note}</Text> : null}
                      <Text size="2xs" tone="subtle">
                        This line has no task, so it is kept as it is and sent back unchanged.
                      </Text>
                    </>
                  ) : (
                    <>
                      <MinutesEditor
                        id={i.key}
                        title={i.task_title}
                        minutes={mins}
                        disabled={locked || busy}
                        onChange={(m) => setItem(i.key, { minutes: m })}
                        onError={setEditorError}
                      />
                      <Input
                        label="What did you do on this?"
                        value={fi?.note ?? ''}
                        editable={!locked && !busy}
                        maxLength={MAX_NOTE}
                        multiline
                        onChangeText={(v) => setItem(i.key, { note: v })}
                      />
                    </>
                  )}
                </Card>
              );
            })}
          </View>
        ))
      )}

      <View style={styles.texts}>
        <Input label="Summary" value={form.summary} editable={!locked && !busy} maxLength={MAX_TEXT} multiline onChangeText={(v) => setField({ summary: v })} />
        <Input label="Blockers" value={form.blockers} editable={!locked && !busy} maxLength={MAX_TEXT} multiline onChangeText={(v) => setField({ blockers: v })} />
        <Input label="Tomorrow's plan" value={form.tomorrow_plan} editable={!locked && !busy} maxLength={MAX_TEXT} multiline onChangeText={(v) => setField({ tomorrow_plan: v })} />
      </View>

      {!locked ? (
        <View style={[styles.actions, { borderTopColor: t.colors.line }]}>
          <Button
            label="Save draft"
            variant="secondary"
            onPress={() => void onSave()}
            loading={save.isPending}
            disabled={!dirty || submit.isPending || hasEditorErrors}
          />
          <Button label="Submit day" onPress={onSubmit} loading={submit.isPending} disabled={save.isPending || hasEditorErrors} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nav: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  flex1: { flex: 1 },
  gap: { marginBottom: 8 },
  card: { gap: 8, marginBottom: 10 },
  group: { marginTop: 12, gap: 8 },
  texts: { gap: 12, marginTop: 16 },
  actions: { gap: 10, marginTop: 20, paddingTop: 16, borderTopWidth: 1, paddingBottom: 24 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  numWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  num: { borderWidth: 1, textAlign: 'center', paddingHorizontal: 8, fontSize: 16 },
});
