import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, type AlertButton } from 'react-native';

import { AppError } from '@/api/errors';
import { parseStatusConfig, parseTasks } from '@/api/models';
import * as projectsApi from '@/api/projectsApi';
import * as qaApi from '@/api/qaApi';
import * as tasksApi from '@/api/tasksApi';
import { FAIL_CONFIRM_BODY, QAPanel, REFAIL_CONFIRM_BODY } from '@/features/qa/QAPanel';
import { QAScreen } from '@/features/qa/QAScreen';
import { useAuthStore } from '@/store/authStore';
import { rawStatuses, rawTask, sessionUser } from '@/test/fixtures';
import { calls, created, fail, installHttpAdapter, ok, resetHttp, useHttp } from '@/test/mockHttp';
import { renderWithProviders } from '@/test/testUtils';
import { resetNowProvider, setNowProvider } from '@/utils/dates';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
  useIsFocused: () => true,
}));
jest.mock('@/api/qaApi', () => ({
  ...jest.requireActual('@/api/qaApi'),
  getQAQueue: jest.fn(),
  getOverdueToQA: jest.fn(),
  getQASummary: jest.fn(),
  getTestCases: jest.fn(),
  submitTestResult: jest.fn(),
  addTestCase: jest.fn(),
}));
jest.mock('@/api/tasksApi', () => ({
  ...jest.requireActual('@/api/tasksApi'),
  changeTaskStatus: jest.fn(),
  getTask: jest.fn(),
}));
jest.mock('@/api/projectsApi');

const qa = qaApi as jest.Mocked<typeof qaApi>;
const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

let alertSpy: jest.SpyInstance;
const lastAlert = () => {
  const c = alertSpy.mock.calls.at(-1) as [string, string, AlertButton[]];
  return { title: c[0], message: c[1], buttons: c[2] };
};
const press = async (text: string) => {
  await act(async () => {
    lastAlert().buttons.find((b) => b.text === text)?.onPress?.();
  });
};

const list = (...rows: Record<string, unknown>[]) => parseTasks(rows);
const row = (over: Record<string, unknown> = {}) => rawTask({ status: 'READY_FOR_QA', qa_owner_id: 8, qaOwner: { id: 8, name: 'Quinn QA' }, ...over });

const summary = (over: Record<string, unknown> = {}) =>
  qaApi.parseQASummary({ total: 4, passed: 2, failed: 1, pending: 1, pass_rate: 50, ...over });
const cases = (...c: Record<string, unknown>[]) => qaApi.parseTestCases(c);
const tc = (id: number, status: 'pass' | 'fail' | 'pending' | null, over: Record<string, unknown> = {}) => ({
  id,
  title: `Case ${id}`,
  steps: 'Open the page',
  expected_result: 'It loads',
  order_index: id,
  results: status ? [{ status, notes: status === 'fail' ? 'Broken' : null, reopen_count: 1, tested_at: '2026-10-09T10:00:00Z', tester: { id: 8, name: 'Quinn QA' } }] : [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  setNowProvider(() => new Date(2026, 9, 10, 10));
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useAuthStore.setState({ status: 'authenticated', token: 't', notice: null, user: sessionUser({ id: 8, roleId: 4 }) });
  projects.getTaskStatuses.mockResolvedValue(parseStatusConfig(rawStatuses()));
  qa.getQAQueue.mockResolvedValue([]);
  qa.getOverdueToQA.mockResolvedValue([]);
  qa.getQASummary.mockResolvedValue(summary());
  qa.getTestCases.mockResolvedValue([]);
});
afterEach(() => {
  alertSpy.mockRestore();
  resetNowProvider();
  jest.useRealTimers();
});

describe('QA API contract', () => {
  beforeAll(() => {
    // Real client + mocked transport for the contract checks below.
    installHttpAdapter();
  });
  beforeEach(() => resetHttp());

  const real = jest.requireActual('@/api/qaApi') as typeof qaApi;

  it('queues: include_subtasks=true ONLY for Ready For QA; Fail/Reopen send just status', async () => {
    useHttp(() => ok([]));
    await real.getQAQueue('READY_FOR_QA');
    expect(calls.at(-1)).toMatchObject({ url: '/tasks', params: { status: 'READY_FOR_QA', include_subtasks: true } });
    await real.getQAQueue('FAIL');
    expect(calls.at(-1)?.params).toEqual({ status: 'FAIL' });
    await real.getQAQueue('REOPEN');
    expect(calls.at(-1)?.params).toEqual({ status: 'REOPEN' });
    await real.getOverdueToQA();
    expect(calls.at(-1)?.params).toEqual({ overdue_to_qa: true });
  });

  it('result is POSTed as JSON {status} in lowercase', async () => {
    useHttp(() => ok({}));
    await real.submitTestResult(5, 9, 'fail');
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/tasks/5/qa/9/result', body: { status: 'fail' } });
    expect(String(calls.at(-1)?.contentType)).not.toContain('multipart');
  });

  it('add test case POSTs {title, steps?, expected_result} (steps omitted when blank)', async () => {
    useHttp(() => created({}));
    await real.addTestCase(5, { title: '  Login  ', steps: '', expected_result: ' Works ' });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', url: '/tasks/5/qa', body: { title: 'Login', expected_result: 'Works' } });
    expect(calls.at(-1)?.body).not.toHaveProperty('steps');
    await real.addTestCase(5, { title: 'T', steps: ' a ', expected_result: 'E' });
    expect(calls.at(-1)?.body).toEqual({ title: 'T', steps: 'a', expected_result: 'E' });
  });

  it('validation: title and expected_result required, title <= 300, nothing sent when invalid', async () => {
    expect(real.validateNewTestCase({ title: '  ', steps: '', expected_result: 'x' })).toEqual({ ok: false, errors: { title: 'Enter a title' } });
    expect(real.validateNewTestCase({ title: 'x', steps: '', expected_result: '' })).toEqual({ ok: false, errors: { expected_result: 'Enter the expected result' } });
    expect(real.validateNewTestCase({ title: 'x'.repeat(301), steps: '', expected_result: 'y' })).toMatchObject({ ok: false });
    expect(real.validateNewTestCase({ title: 'x'.repeat(300), steps: '', expected_result: 'y' })).toMatchObject({ ok: true });
    const before = calls.length;
    await expect(real.addTestCase(5, { title: '', steps: '', expected_result: '' })).rejects.toMatchObject({ kind: 'validation' });
    expect(calls.length).toBe(before);
  });

  it('parses cases with the single latest result, sorted by order_index', () => {
    const parsed = real.parseTestCases([tc(2, 'pass'), tc(1, null), { title: 'no id' }]);
    expect(parsed.map((c) => c.id)).toEqual([1, 2]);
    expect(real.latestResult(parsed[0]!)).toBeNull();
    expect(real.latestResult(parsed[1]!)).toMatchObject({ status: 'pass', tester: { name: 'Quinn QA' } });
  });

  it('summary parsing clamps pass_rate and defaults', () => {
    expect(real.parseQASummary(null)).toEqual({ total: 0, passed: 0, failed: 0, pending: 0, pass_rate: 0 });
    expect(real.parseQASummary({ pass_rate: 250 }).pass_rate).toBe(100);
  });

  it('server 403/422 messages pass through verbatim', async () => {
    useHttp(() => fail(422, 'Validation failed', [{ field: 'expected_result', message: 'Expected result required' }]));
    await expect(real.addTestCase(5, { title: 'a', steps: '', expected_result: 'b' })).rejects.toMatchObject({
      kind: 'validation',
      message: 'Expected result required',
    });
  });
});

describe('QA queue', () => {
  const render = () => renderWithProviders(<QAScreen />);

  it('shows three tabs with counts and the unique awaiting total across lists', async () => {
    qa.getQAQueue.mockImplementation(async (s) =>
      s === 'READY_FOR_QA'
        ? list(row({ id: 1, title: 'A' }), row({ id: 2, title: 'B' }))
        : s === 'FAIL'
          ? list(row({ id: 2, title: 'B', status: 'FAIL' }), row({ id: 3, title: 'C', status: 'FAIL' }))
          : list(row({ id: 4, title: 'D', status: 'REOPEN' })),
    );
    render();
    expect(await screen.findByRole('button', { name: 'Ready for QA, 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fail, 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reopen, 1' })).toBeTruthy();
    expect(screen.getByTestId('qa-awaiting')).toHaveTextContent(/^4 tasks awaiting QA$/); // ids 1,2,3,4 (2 counted once)

    fireEvent.press(screen.getByTestId('qa-tab-FAIL'));
    expect(await screen.findByText('C')).toBeTruthy();
    expect(screen.queryByText('A')).toBeNull();
  });

  it('rows show title, status, QA owner or Unassigned, reopen count and sprint', async () => {
    qa.getQAQueue.mockImplementation(async (s) =>
      s === 'READY_FOR_QA'
        ? list(
            row({ id: 1, title: 'Owned', reopen_count: 2, sprint: { id: 1, name: 'Sprint 9' } }),
            row({ id: 2, title: 'Free', qa_owner_id: null, qaOwner: null, reopen_count: 0 }),
          )
        : [],
    );
    render();
    expect(await screen.findByTestId('qa-row-1')).toHaveTextContent(/Owned/);
    expect(screen.getByTestId('qa-row-1')).toHaveTextContent(/QA: Quinn QA/);
    expect(screen.getByTestId('qa-row-1')).toHaveTextContent(/Reopened 2×/);
    expect(screen.getByTestId('qa-row-1')).toHaveTextContent(/Sprint 9/);
    expect(screen.getByTestId('qa-row-2')).toHaveTextContent(/QA: Unassigned/);
    expect(screen.getByTestId('qa-row-2')).not.toHaveTextContent(/Reopened/);
  });

  it('parents with ready subtasks show the explanation and subtask Pass/Fail buttons', async () => {
    qa.getQAQueue.mockImplementation(async (s) =>
      s === 'READY_FOR_QA'
        ? list(
            row({
              id: 10, title: 'Parent', status: 'IN_PROGRESS',
              ready_subtasks: [rawTask({ id: 11, title: 'Sub one', status: 'READY_FOR_QA' }), rawTask({ id: 12, title: 'Sub two', status: 'READY_FOR_QA' })],
            }),
          )
        : [],
    );
    tasks.changeTaskStatus.mockResolvedValue(undefined);
    render();
    expect(await screen.findByText('Parent task is not ready itself · 2 subtasks ready for QA')).toBeTruthy();
    expect(screen.getByTestId('qa-sub-11')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Pass Sub one' }));
    await waitFor(() => expect(tasks.changeTaskStatus).toHaveBeenCalledWith(11, 'PASS', undefined));
    fireEvent.press(screen.getByRole('button', { name: 'Fail Sub two' }));
    await waitFor(() => expect(tasks.changeTaskStatus).toHaveBeenCalledWith(12, 'FAIL', undefined));
  });

  it('a parent that IS ready itself does not get the "not ready" message', async () => {
    qa.getQAQueue.mockImplementation(async (s) =>
      s === 'READY_FOR_QA' ? list(row({ id: 10, title: 'Parent', ready_subtasks: [rawTask({ id: 11, title: 'Sub', status: 'READY_FOR_QA' })] })) : [],
    );
    render();
    await screen.findByTestId('qa-row-10');
    expect(screen.queryByText(/Parent task is not ready itself/)).toBeNull();
  });

  it('Overdue to QA: count chip, days from release_to_qa_date on the local calendar', async () => {
    qa.getOverdueToQA.mockResolvedValue(
      list(
        row({ id: 7, title: 'Late one', status: 'IN_PROGRESS', release_to_qa_date: '2026-10-07' }),
        row({ id: 8, title: 'Yesterday', status: 'IN_PROGRESS', release_to_qa_date: '2026-10-09' }),
      ),
    );
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'Overdue to QA, 2' }));
    expect(await screen.findByTestId('qa-row-7')).toHaveTextContent(/3d overdue to QA/);
    expect(screen.getByTestId('qa-row-8')).toHaveTextContent(/1d overdue to QA/);
  });

  it('Overdue to QA is refetched every 5 minutes while active', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    render();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(qa.getOverdueToQA).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(qa.getOverdueToQA.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('tapping a row opens the QA task panel', async () => {
    qa.getQAQueue.mockImplementation(async (s) => (s === 'READY_FOR_QA' ? list(row({ id: 1, title: 'A' })) : []));
    render();
    fireEvent.press(await screen.findByLabelText(/^A\. /));
    expect(mockNavigate).toHaveBeenCalledWith('QATask', { taskId: 1 });
  });

  it('errors with retry and empty states', async () => {
    qa.getQAQueue.mockRejectedValueOnce(new AppError({ kind: 'forbidden', status: 403, message: 'Access denied.' }));
    render();
    expect(await screen.findByText('Access denied.')).toBeTruthy();
    qa.getQAQueue.mockResolvedValue([]);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing here')).toBeTruthy();
    expect(screen.getByTestId('qa-awaiting')).toHaveTextContent(/^0 tasks awaiting QA$/);
  });
});

describe('QA panel: summary, verdicts, cases', () => {
  const renderPanel = (status: string, canAct = true) =>
    renderWithProviders(<QAPanel taskId={5} status={status} canAct={canAct} />);

  it('shows the four summary tiles and pass rate', async () => {
    renderPanel('READY_FOR_QA');
    expect(await screen.findByLabelText('Total: 4')).toBeTruthy();
    expect(screen.getByLabelText('Passed: 2')).toBeTruthy();
    expect(screen.getByLabelText('Failed: 1')).toBeTruthy();
    expect(screen.getByLabelText('Pending: 1')).toBeTruthy();
    expect(screen.getByText('Pass rate 50%')).toBeTruthy();
  });

  it('READY_FOR_QA offers Pass and Fail; they PATCH the status with no note', async () => {
    tasks.changeTaskStatus.mockResolvedValue(undefined);
    renderPanel('READY_FOR_QA');
    expect(await screen.findByRole('button', { name: 'Pass' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fail' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Pass' }));
    await waitFor(() => expect(tasks.changeTaskStatus).toHaveBeenCalledWith(5, 'PASS', undefined));
    expect(await screen.findByText('Moved to Pass')).toBeTruthy();
  });

  it('FAIL offers only Reopen', async () => {
    tasks.changeTaskStatus.mockResolvedValue(undefined);
    renderPanel('FAIL');
    fireEvent.press(await screen.findByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(tasks.changeTaskStatus).toHaveBeenCalledWith(5, 'REOPEN', undefined));
    expect(screen.queryByRole('button', { name: 'Pass' })).toBeNull();
  });

  it.each(['IN_PROGRESS', 'NOT_STARTED', 'PASS', 'REOPEN'])('status %s shows an explanation instead of verdict buttons', async (status) => {
    renderPanel(status);
    expect(await screen.findByText(/A verdict can be recorded when the task is Ready for QA/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pass' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fail' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  });

  it('a verdict rejected by the server shows its message verbatim and does not sign out', async () => {
    tasks.changeTaskStatus.mockRejectedValue(new AppError({ kind: 'validation', status: 400, message: 'Cannot move from READY_FOR_QA to PASS' }));
    renderPanel('READY_FOR_QA');
    fireEvent.press(await screen.findByRole('button', { name: 'Pass' }));
    expect(await screen.findByText('Cannot move from READY_FOR_QA to PASS')).toBeTruthy();
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('read-only (canAct=false): everything visible, no verdict, no per-case buttons, no add form', async () => {
    qa.getTestCases.mockResolvedValue(cases(tc(1, 'fail'), tc(2, 'pass'), tc(3, null)));
    renderPanel('READY_FOR_QA', false);
    expect(await screen.findByTestId('case-1')).toHaveTextContent(/Case 1/);
    expect(screen.getByTestId('case-1')).toHaveTextContent(/Failed/);
    expect(screen.getByTestId('case-1')).toHaveTextContent(/Notes: Broken/);
    expect(screen.getByTestId('case-1')).toHaveTextContent(/Reopened 1×/);
    expect(screen.getByTestId('case-2')).toHaveTextContent(/Passed/);
    expect(screen.getByTestId('case-3')).toHaveTextContent(/Pending/);
    expect(screen.queryByTestId('qa-verdict')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Pass Case/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Fail Case/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add test case' })).toBeNull();
  });

  describe('test case results', () => {
    beforeEach(() => qa.getTestCases.mockResolvedValue(cases(tc(1, null), tc(2, 'fail'), tc(3, 'pass'))));

    it('one-tap Pass is optimistic and sends lowercase "pass"', async () => {
      let finish!: () => void;
      qa.submitTestResult.mockImplementation(() => new Promise((r) => { finish = () => r({}); }));
      renderPanel('READY_FOR_QA');
      await screen.findByTestId('case-1');
      expect(screen.getByTestId('case-1')).toHaveTextContent(/Pending/);
      fireEvent.press(screen.getByRole('button', { name: 'Pass Case 1' }));
      await waitFor(() => expect(qa.submitTestResult).toHaveBeenCalledWith(5, 1, 'pass'));
      await waitFor(() => expect(screen.getByTestId('case-1')).toHaveTextContent(/Passed/)); // before the server answered
      qa.getTestCases.mockResolvedValue(cases(tc(1, 'pass'), tc(2, 'fail'), tc(3, 'pass')));
      await act(async () => finish());
    });

    it('a failed submit rolls the case back and shows the server message', async () => {
      qa.submitTestResult.mockRejectedValue(new AppError({ kind: 'not_found', status: 404, message: 'Test case not found' }));
      renderPanel('READY_FOR_QA');
      await screen.findByTestId('case-1');
      fireEvent.press(screen.getByRole('button', { name: 'Pass Case 1' }));
      expect(await screen.findByText('Test case not found')).toBeTruthy();
      await waitFor(() => expect(screen.getByTestId('case-1')).toHaveTextContent(/Pending/));
    });

    it('Pass is disabled on an already-passed case (no needless write that wipes attachments)', async () => {
      renderPanel('READY_FOR_QA');
      await screen.findByTestId('case-3');
      expect(screen.getByRole('button', { name: 'Pass Case 3' }).props.accessibilityState.disabled).toBe(true);
    });

    it('Fail ALWAYS confirms, explaining the reopen-count side effect; Cancel sends nothing', async () => {
      renderPanel('READY_FOR_QA');
      await screen.findByTestId('case-1');
      fireEvent.press(screen.getByRole('button', { name: 'Fail Case 1' }));
      expect(lastAlert().title).toBe('Record a failure?');
      expect(lastAlert().message).toBe(FAIL_CONFIRM_BODY);
      expect(FAIL_CONFIRM_BODY).toBe("This records a failure and increases the task's reopen count.");
      await press('Cancel');
      expect(qa.submitTestResult).not.toHaveBeenCalled();
    });

    it('confirming sends lowercase "fail"', async () => {
      qa.submitTestResult.mockResolvedValue({});
      renderPanel('READY_FOR_QA');
      await screen.findByTestId('case-1');
      fireEvent.press(screen.getByRole('button', { name: 'Fail Case 1' }));
      await press('Record failure');
      await waitFor(() => expect(qa.submitTestResult).toHaveBeenCalledWith(5, 1, 'fail'));
    });

    it('re-failing an already-failed case needs a stronger confirm (server bumps reopen_count every time)', async () => {
      qa.submitTestResult.mockResolvedValue({});
      renderPanel('READY_FOR_QA');
      await screen.findByTestId('case-2');
      fireEvent.press(screen.getByRole('button', { name: 'Fail Case 2' }));
      expect(lastAlert().message).toBe(REFAIL_CONFIRM_BODY);
      expect(qa.submitTestResult).not.toHaveBeenCalled();
      await press('Record failure');
      await waitFor(() => expect(qa.submitTestResult).toHaveBeenCalledWith(5, 2, 'fail'));
    });
  });

  describe('add test case', () => {
    it('requires title and expected result (inline errors, nothing sent)', async () => {
      renderPanel('READY_FOR_QA');
      fireEvent.press(await screen.findByRole('button', { name: 'Add test case' }));
      fireEvent.press(within_form('Add test case'));
      expect(await screen.findByText('Enter a title')).toBeTruthy();
      expect(screen.getByText('Enter the expected result')).toBeTruthy();
      expect(qa.addTestCase).not.toHaveBeenCalled();
    });

    it('caps the title at 300 characters', async () => {
      renderPanel('READY_FOR_QA');
      fireEvent.press(await screen.findByRole('button', { name: 'Add test case' }));
      expect(screen.getByLabelText('Test case title').props.maxLength).toBe(300);
    });

    it('success shows "Test case added", closes the form and refreshes', async () => {
      qa.addTestCase.mockResolvedValue({});
      renderPanel('READY_FOR_QA');
      fireEvent.press(await screen.findByRole('button', { name: 'Add test case' }));
      fireEvent.changeText(screen.getByLabelText('Test case title'), 'Login works');
      fireEvent.changeText(screen.getByLabelText('Expected result'), 'User lands on the dashboard');
      fireEvent.press(within_form('Add test case'));
      await waitFor(() => expect(qa.addTestCase).toHaveBeenCalledWith(5, { title: 'Login works', steps: '', expected_result: 'User lands on the dashboard' }));
      expect(await screen.findByText('Test case added')).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId('add-case-form')).toBeNull());
    });

    it('a server 422 is shown verbatim and the form keeps its input', async () => {
      qa.addTestCase.mockRejectedValue(new AppError({ kind: 'validation', status: 422, message: 'Expected result required' }));
      renderPanel('READY_FOR_QA');
      fireEvent.press(await screen.findByRole('button', { name: 'Add test case' }));
      fireEvent.changeText(screen.getByLabelText('Test case title'), 'T');
      fireEvent.changeText(screen.getByLabelText('Expected result'), 'E');
      fireEvent.press(within_form('Add test case'));
      expect(await screen.findByTestId('add-case-error')).toHaveTextContent('Expected result required');
      expect(screen.getByLabelText('Test case title').props.value).toBe('T');
    });
  });

  it('summary/cases errors with retry; a failed refetch keeps stale data with a banner', async () => {
    qa.getQASummary.mockRejectedValueOnce(new AppError({ kind: 'server', status: 500, message: 'Something went wrong on our side.' }));
    const { queryClient } = renderPanel('READY_FOR_QA');
    expect(await screen.findByText('Something went wrong on our side.')).toBeTruthy();
    qa.getQASummary.mockResolvedValue(summary());
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Total: 4')).toBeTruthy();

    qa.getQASummary.mockRejectedValue(new AppError({ kind: 'network', message: "Can't reach the server." }));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['task-qa-summary', 5] });
    });
    expect(await screen.findByTestId('stale-banner')).toBeTruthy();
    expect(screen.getByLabelText('Total: 4')).toBeTruthy();
  });
});

/** The "Add test case" submit button inside the open form (the toggle button disappears when it opens). */
function within_form(name: string) {
  return screen.getAllByRole('button', { name }).at(-1) as ReturnType<typeof screen.getByRole>;
}
