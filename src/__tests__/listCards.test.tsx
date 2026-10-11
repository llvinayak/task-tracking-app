import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';

import { TicketCard } from '@/features/tickets/TicketsScreen';
import { SprintCard } from '@/features/sprints/SprintsScreen';
import { TaskCard } from '@/features/tasks/TaskCard';
import { parseStatusConfig } from '@/api/models';
import { labelInNameViolations } from '@/test/a11y';
import { rawStatuses, task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/testUtils';

const config = parseStatusConfig(rawStatuses());

describe('TaskCard (memoized, stable props)', () => {
  const base = { config, today: '2026-10-10', highlightOverdue: false, canMove: true, onPress: jest.fn(), onMove: jest.fn() };

  it('renders priority as icon + word, the flag as one line, and never colours the type', () => {
    renderWithProviders(<TaskCard {...base} task={task({ id: 1, title: 'Blocked thing', is_blocked: true, priority: 'MEDIUM', task_type: 'BUG' })} />);
    expect(screen.getByText('Blocked')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy(); // outline badge: the word carries the level
    expect(screen.getByText('Bug')).toBeTruthy(); // plain text, not a coloured badge
  });

  it('the Move button says "Move" and names the task; Label in Name holds on the card', () => {
    const onMove = jest.fn();
    renderWithProviders(<TaskCard {...base} onMove={onMove} task={task({ id: 2, title: 'Movable' })} />);
    expect(screen.getByText('Move')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Move Movable' }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(labelInNameViolations()).toEqual([]);
  });

  it('no Move button when the user cannot move it; the footer then disappears unless the status is shown', () => {
    renderWithProviders(<TaskCard {...base} canMove={false} task={task({ id: 3, title: 'Read only' })} />);
    expect(screen.queryByText('Move')).toBeNull();
  });

  it('showStatus adds the status badge', () => {
    renderWithProviders(<TaskCard {...base} canMove={false} showStatus task={task({ id: 4, title: 'With status', status: 'IN_PROGRESS' })} />);
    expect(screen.getByText('In Progress')).toBeTruthy();
  });
});

describe('Ticket and Sprint cards keep their testIDs and accessible names', () => {
  it('TicketCard', () => {
    const onPress = jest.fn();
    const ticket = {
      id: 9,
      title: 'Cannot log in',
      severity: 4,
      status: 'open',
      project: { id: 1, name: 'Alpha', color: '#336699' },
      client: null,
      client_name: 'Acme',
      assignee: null,
      created_at: '2026-10-01T00:00:00Z',
    } as never;
    renderWithProviders(<TicketCard ticket={ticket} onPress={onPress} />);
    expect(screen.getByTestId('ticket-9')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^Cannot log in\. .* severity\. Open\. Unassigned\. Alpha · Acme/));
    expect(onPress).toHaveBeenCalled();
  });

  it('SprintCard', () => {
    const onPress = jest.fn();
    const sprint = {
      id: 3,
      name: 'Sprint 12',
      status: 'active',
      start_date: '2026-10-01',
      end_date: '2026-10-14',
      project: { id: 1, name: 'Alpha', color: '#336699' },
      completionPct: 62,
      completedCount: 8,
      taskCount: 13,
      blockedCount: 2,
    } as never;
    renderWithProviders(<SprintCard sprint={sprint} onPress={onPress} />);
    expect(screen.getByTestId('sprint-3')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Sprint 12 progress' }).props.accessibilityValue).toMatchObject({ now: 62 });
    fireEvent.press(screen.getByLabelText(/^Sprint 12\. active\. 62% complete\. 8 of 13 tasks done\. 2 blocked\. Alpha/));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText(/2 blocked/)).toBeTruthy();
  });
});
