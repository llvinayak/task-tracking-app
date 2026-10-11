import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { TITLE_MAX, latestResult, validateNewTestCase, type TestCase } from '@/api/qaApi';
import { Badge, Banner, Button, Card, EmptyState, ErrorState, Input, LoadingState, StaleBanner, Text } from '@/components/ui';
import { captureSession } from '@/hooks/sessionMutation';
import { useAddTestCase, useQASummary, useSubmitResult, useTestCases } from '@/hooks/qa';
import { useTaskConfig } from '@/hooks/queries';
import { useChangeStatus } from '@/hooks/taskMutations';
import { formatDateTime } from '@/utils/dates';
import { allowedTargets, statusLabel } from '@/utils/taskUtils';

export const REOPEN_CONFIRM_TITLE = 'Reopen this task?';
export const REOPEN_CONFIRM_BODY = 'This sends it back to development and increases its reopen count by one.';
export const FAIL_CONFIRM_TITLE = 'Record a failure?';
export const FAIL_CONFIRM_BODY = "This records a failure and increases the task's reopen count.";
export const REFAIL_CONFIRM_BODY =
  "This case has already failed. Recording it again increases the task's reopen count again.";

/** One summary figure: the accessible name stays "Label: value" (same as the old tiles). */
function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.summaryItem} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text size="lg" weight="bold" numeric>
        {value}
      </Text>
      <Text size="xs" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const TONE = { pass: 'success', fail: 'danger', pending: 'neutral' } as const;

function CaseRow({
  tc,
  canAct,
  busy,
  onResult,
}: {
  tc: TestCase;
  canAct: boolean;
  busy: boolean;
  onResult: (tc: TestCase, status: 'pass' | 'fail') => void;
}) {
  const latest = latestResult(tc);
  const status = latest?.status ?? 'pending';
  return (
    <Card style={styles.gap} testID={`case-${tc.id}`}>
      <View style={styles.between}>
        <Text weight="semibold" style={styles.flex1}>
          {tc.title}
        </Text>
        <Badge label={status === 'pass' ? 'Passed' : status === 'fail' ? 'Failed' : 'Pending'} tone={TONE[status]} />
      </View>
      {tc.steps ? (
        <Text size="sm" tone="muted">
          Steps: {tc.steps}
        </Text>
      ) : null}
      {tc.expected_result ? (
        <Text size="sm" tone="muted">
          Expected: {tc.expected_result}
        </Text>
      ) : null}
      {latest?.notes ? <Text size="sm">Notes: {latest.notes}</Text> : null}
      {latest && latest.reopen_count > 0 ? (
        <Text size="xs" tone="subtle">
          Reopened {latest.reopen_count}x
        </Text>
      ) : null}
      {latest?.tested_at ? (
        <Text size="2xs" tone="subtle">
          Tested {formatDateTime(latest.tested_at)}
          {latest.tester ? ` by ${latest.tester.name}` : ''}
        </Text>
      ) : null}
      {canAct ? (
        <View style={styles.actions}>
          <Button
            label="Pass"
            accessibilityLabel={`Pass ${tc.title}`}
            variant="secondary"
            size="compact"
            fullWidth={false}
            disabled={busy || status === 'pass'}
            onPress={() => onResult(tc, 'pass')}
          />
          <Button
            label="Fail"
            accessibilityLabel={`Fail ${tc.title}`}
            variant="dangerOutline"
            size="compact"
            fullWidth={false}
            disabled={busy}
            onPress={() => onResult(tc, 'fail')}
          />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * QA summary + verdict + test cases for one task. Read-only unless `canAct`
 * (the user can open the QA module). The server decides what is allowed.
 */
export function QAPanel({ taskId, status, canAct }: { taskId: number; status: string; canAct: boolean }) {
  const { config } = useTaskConfig();
  const summary = useQASummary(taskId);
  const cases = useTestCases(taskId);
  const result = useSubmitResult(taskId);
  const change = useChangeStatus();
  const add = useAddTestCase(taskId);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', steps: '', expected_result: '' });
  const [errors, setErrors] = useState<{ title?: string; expected_result?: string }>({});
  const [addError, setAddError] = useState<string | null>(null);

  const onResult = (tc: TestCase, next: 'pass' | 'fail') => {
    if (next === 'pass') {
      result.mutate({ testCaseId: tc.id, status: 'pass' });
      return;
    }
    // A fail always confirms: the server bumps the task's reopen_count on EVERY fail,
    // even for a case that has already failed.
    const already = latestResult(tc)?.status === 'fail';
    Alert.alert(FAIL_CONFIRM_TITLE, already ? REFAIL_CONFIRM_BODY : FAIL_CONFIRM_BODY, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Record failure', style: 'destructive', onPress: () => result.mutate({ testCaseId: tc.id, status: 'fail' }) },
    ]);
  };

  const submitCase = async () => {
    const v = validateNewTestCase(form);
    setAddError(null);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    const alive = captureSession();
    try {
      await add.mutateAsync(form);
      if (!alive()) return;
      setForm({ title: '', steps: '', expected_result: '' });
      setAdding(false);
    } catch (e) {
      if (!alive()) return;
      setAddError(getErrorMessage(e)); // 422 verbatim
    }
  };

  // Candidate verdicts: READY_FOR_QA -> Pass / Fail; FAIL -> Reopen. Whether each
  // is actually offered comes ONLY from /config allowed_transitions (the same
  // table the server enforces); a disallowed one is disabled WITH a reason.
  // NOTE: the server has no project/assignee check on QA endpoints (backend gap),
  // so gating on canView('/qa') above is a courtesy, not security.
  const candidates: { status: string; label: string; variant: 'primary' | 'dangerOutline' | 'secondary' }[] =
    status === 'READY_FOR_QA'
      ? [
          { status: 'PASS', label: 'Pass task', variant: 'primary' },
          { status: 'FAIL', label: 'Fail task', variant: 'dangerOutline' },
        ]
      : status === 'FAIL'
        ? [{ status: 'REOPEN', label: 'Reopen', variant: 'secondary' }]
        : [];
  const allowedKeys = new Set(allowedTargets(config, status).map((s) => s.key));

  return (
    <View style={styles.gap}>
      {summary.isLoading ? <LoadingState label="Loading QA summary..." /> : null}
      {summary.isError && !summary.data ? (
        <ErrorState message={getErrorMessage(summary.error)} onRetry={() => void summary.refetch()} />
      ) : null}
      {summary.isError && summary.data ? <StaleBanner message={getErrorMessage(summary.error)} /> : null}
      {canAct ? (
        <Card style={styles.gap} testID="qa-verdict">
          <Text size="xs" tone="subtle" weight="semibold">
            VERDICT
          </Text>
          {candidates.length > 0 ? (
            <View style={styles.gap}>
              <View style={styles.actions}>
                {candidates.map((v) => (
                  <Button
                    key={v.status}
                    label={v.label}
                    variant={v.variant}
                    fullWidth={false}
                    loading={change.isPending && change.variables?.status === v.status}
                    disabled={change.isPending || !allowedKeys.has(v.status)}
                    onPress={() => {
                      const go = () =>
                        change.mutate({
                          taskId,
                          status: v.status,
                          successMessage: `Moved to ${statusLabel(config, v.status)}`,
                        });
                      // Reopen sends the task back to development and bumps its reopen count: confirm first.
                      if (v.status === 'REOPEN') {
                        Alert.alert(REOPEN_CONFIRM_TITLE, REOPEN_CONFIRM_BODY, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Reopen', style: 'destructive', onPress: go },
                        ]);
                        return;
                      }
                      go();
                    }}
                  />
                ))}
              </View>
              {candidates.some((v) => v.status === 'REOPEN') ? (
                <Text size="xs" tone="muted">
                  Reopen increases the task&apos;s reopen count.
                </Text>
              ) : null}
              {candidates
                .filter((v) => !allowedKeys.has(v.status))
                .map((v) => (
                  <Text key={v.status} size="xs" tone="muted" testID={`verdict-reason-${v.status}`}>
                    {config
                      ? `${v.label.replace(' task', '')} can't be recorded while this task is ${statusLabel(config, status)}.`
                      : 'Loading the workflow...'}
                  </Text>
                ))}
            </View>
          ) : (
            <Text size="sm" tone="muted">
              A verdict can be recorded when the task is Ready for QA (Pass or Fail) or Failed (Reopen). This task is{' '}
              {statusLabel(config, status)}.
            </Text>
          )}
        </Card>
      ) : null}

      {summary.data ? (
        <Card style={styles.gap} testID="qa-summary">
          <View style={styles.tiles}>
            <SummaryItem label="Total" value={summary.data.total} />
            <SummaryItem label="Passed" value={summary.data.passed} />
            <SummaryItem label="Failed" value={summary.data.failed} />
            <SummaryItem label="Pending" value={summary.data.pending} />
          </View>
          <Text size="xs" tone="muted">
            Pass rate {summary.data.pass_rate}%
          </Text>
        </Card>
      ) : null}
      {cases.isLoading ? <LoadingState label="Loading test cases..." /> : null}
      {cases.isError && !cases.data ? (
        <ErrorState message={getErrorMessage(cases.error)} onRetry={() => void cases.refetch()} />
      ) : null}
      {cases.isError && cases.data ? <StaleBanner message={getErrorMessage(cases.error)} /> : null}
      {cases.data && cases.data.length === 0 ? <EmptyState title="No test cases yet" /> : null}
      {(cases.data ?? []).map((tc) => (
        <CaseRow key={tc.id} tc={tc} canAct={canAct} busy={result.isPending} onResult={onResult} />
      ))}

      {canAct ? (
        adding ? (
          <Card style={styles.gap} testID="add-case-form">
            {addError ? <Banner message={addError} testID="add-case-error" /> : null}
            <Input
              label="Test case title"
              value={form.title}
              maxLength={TITLE_MAX}
              error={errors.title}
              onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
            />
            <Input label="Steps (optional)" value={form.steps} multiline onChangeText={(v) => setForm((f) => ({ ...f, steps: v }))} />
            <Input
              label="Expected result"
              value={form.expected_result}
              multiline
              error={errors.expected_result}
              onChangeText={(v) => setForm((f) => ({ ...f, expected_result: v }))}
            />
            <View style={styles.actions}>
              <Button label="Add test case" fullWidth={false} loading={add.isPending} onPress={() => void submitCase()} />
              <Button label="Cancel" variant="ghost" fullWidth={false} onPress={() => setAdding(false)} />
            </View>
          </Card>
        ) : (
          <Button label="Add test case" variant="secondary" onPress={() => setAdding(true)} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  flex1: { flex: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8 },
  summaryItem: { alignItems: 'flex-start', gap: 2 },
});
