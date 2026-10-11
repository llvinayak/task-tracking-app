import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionMutation } from './sessionMutation';

import { getErrorMessage } from '@/api/errors';
import {
  addTicketComment,
  buildTicketParams,
  createTicket,
  getAssignableUsers,
  getTicket,
  getTicketComments,
  getTickets,
  updateTicket,
  type NewTicket,
  type TicketComment,
  type TicketDetail,
  type TicketFilters,
  type TicketPatch,
} from '@/api/ticketsApi';
import { useToast } from '@/components/ui';
import { ROLE_IDS } from '@/config/constants';
import { useAuthStore } from '@/store/authStore';

export const ticketKeys = {
  root: ['tickets'] as const,
  list: (f: TicketFilters) => ['tickets', buildTicketParams(f)] as const,
  one: (id: number) => ['ticket', id] as const,
  comments: (id: number) => ['ticket-comments', id] as const,
  assignable: ['assignable-users'] as const,
};

export const useTickets = (f: TicketFilters) => useQuery({ queryKey: ticketKeys.list(f), queryFn: () => getTickets(f) });

export const useTicket = (id: number) => useQuery({ queryKey: ticketKeys.one(id), queryFn: () => getTicket(id), enabled: id > 0 });

export const useTicketComments = (id: number) =>
  useQuery({ queryKey: ticketKeys.comments(id), queryFn: () => getTicketComments(id), enabled: id > 0 });

/** Names only, cached 5 minutes. The endpoint also returns emails, which are dropped on parse. */
export const useAssignableUsers = (enabled: boolean) =>
  useQuery({
    queryKey: ticketKeys.assignable,
    queryFn: () => getAssignableUsers(ROLE_IDS.CLIENT),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

/** Tickets with an update (status OR assignee) in flight. Module-level on purpose: see useUpdateTicket. */
const updateLocks = new Set<number>();
export const __resetTicketLocks = () => updateLocks.clear();

/**
 * Status chips and the assignee sheet are different components but ONE write path:
 * they share a single pending flag (useIsMutating on the ticket's mutation key) and
 * a ref lock, so two quick taps (or a status tap during an assignee change) can never
 * send two PUTs. The lock is released in the mutation's own onSettled, which still
 * runs if the screen unmounts.
 */
export function useUpdateTicket(id: number) {
  const qc = useQueryClient();
  const toast = useToast();
  const mutationKey = ['ticket-update', id] as const;
  const m = useSessionMutation({
    mutationKey,
    mutationFn: (patch: TicketPatch) => updateTicket(id, patch),
    onSuccess: (ticket: TicketDetail) => {
      qc.setQueryData(ticketKeys.one(id), ticket);
      void qc.invalidateQueries({ queryKey: ticketKeys.root });
      toast.show('Ticket updated', 'success');
    },
    onError: (err) => toast.show(getErrorMessage(err), 'danger'),
    onSettled: () => {
      updateLocks.delete(id);
    },
  });
  const pending = useIsMutating({ mutationKey }) > 0;
  return {
    isPending: pending,
    mutate: (patch: TicketPatch) => {
      if (updateLocks.has(id)) return;
      updateLocks.add(id);
      m.mutate(patch);
    },
  };
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useSessionMutation({
    mutationFn: (v: NewTicket) => createTicket(v),
    onSuccess: (t) => {
      qc.setQueryData(ticketKeys.one(t.id), t);
      void qc.invalidateQueries({ queryKey: ticketKeys.root });
    },
  });
}

export function useAddTicketComment(id: number) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  return useSessionMutation({
    mutationFn: (content: string) => addTicketComment(id, content, { id: me?.id ?? 0, name: me?.name ?? 'You' }),
    onSuccess: (c) => {
      qc.setQueryData<TicketComment[]>(ticketKeys.comments(id), (old) => [...(old ?? []), c]);
      void qc.invalidateQueries({ queryKey: ticketKeys.comments(id) });
    },
  });
}
