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

export const FAIL_CONFIRM_TITLE = 'Record a failure?';
export const FAIL_CONFIRM_BODY = "This records a failure and increases the task's reopen count.";
export const REFAIL_CONFIRM_BODY =
  "This case has already failed. Recording it again increases the task's reopen count again.";

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text size="2xl" weight="bold">
        {value}
      </Text>
      <Text size="xs" tone="muted">
        {label}
      </Text>
    </Card>
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
          Reopened {latest.reopen_count}×
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
            label={`Pass ${tc.title}`}
            variant="secondary"
            fullWidth={false}
            disabled={busy || status === 'pass'}
            onPress={() => onResult(tc, 'pass')}
          />
          <Button
            label={`Fail ${tc.title}`}
            variant="danger"
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
  const candidates: { status: string; label: string; variant: 'primary' | 'danger' | 'secondary' }[] =
    status === 'READY_FOR_QA'
      ? [
          { status: 'PASS', label: 'Pass', variant: 'primary' },
          { status: 'FAIL', label: 'Fail', variant: 'danger' },
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
      {summary.data ? (
        <View style={styles.tiles} testID="qa-summary">
          <Tile label="Total" value={summary.data.total} />
          <Tile label="Passed" value={summary.data.passed} />
          <Tile label="Failed" value={summary.data.failed} />
          <Tile label="Pending" value={summary.data.pending} />
          <Text size="xs" tone="muted" style={styles.rate}>
            Pass rate {summary.data.pass_rate}%
          </Text>
        </View>
      ) : null}

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
                    onPress={() =>
                      change.mutate({
                        taskId,
                        status: v.status,
                        successMessage: `Moved to ${statusLabel(config, v.status)}`,
                      })
                    }
                  />
                ))}
              </View>
              {candidates
                .filter((v) => !allowedKeys.has(v.status))
                .map((v) => (
                  <Text key={v.status} size="xs" tone="muted" testID={`verdict-reason-${v.status}`}>
                    {config
                      ? `${v.label} is not allowed from ${statusLabel(config, status)} in this workflow.`
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
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '22%', alignItems: 'center', gap: 2 },
  rate: { width: '100%' },
});
