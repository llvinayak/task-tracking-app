import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { SEVERITIES, SEVERITY_LABEL, validateNewTicket, type TicketFormErrors } from '@/api/ticketsApi';
import { Banner, BottomSheet, Button, ChoiceChips, Dot, Icon, ErrorState, Input, LoadingState, OptionRow, Screen, Text } from '@/components/ui';
import { useProjects } from '@/hooks/queries';
import { captureSession } from '@/hooks/sessionMutation';
import { useCreateTicket } from '@/hooks/tickets';
import type { RootStackParamList } from '@/navigation/types';
import { useProjectStore } from '@/store/projectStore';
import { useTheme } from '@/theme/ThemeProvider';

/** New ticket. Sent as JSON; no attachments from mobile. */
export function TicketCreateScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const picked = useProjectStore((s) => s.selected);
  const projects = useProjects();
  const create = useCreateTicket();
  /** Ref lock: state (isPending) updates a render later, so a fast double tap could create two tickets. */
  const submitting = useRef(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<number | null>(picked?.id ?? null);
  const [severity, setSeverity] = useState<number | null>(2);
  const [clientName, setClientName] = useState('');
  const [sheet, setSheet] = useState(false);
  const [errors, setErrors] = useState<TicketFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const project = projects.data?.find((p) => p.id === projectId) ?? (picked && picked.id === projectId ? picked : null);

  const submit = async () => {
    if (submitting.current || create.isPending) return;
    setServerError(null);
    const v = validateNewTicket({ title, description, project_id: projectId, severity, client_name: clientName });
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    submitting.current = true;
    const alive = captureSession();
    try {
      const created = await create.mutateAsync({ title, description, project_id: projectId, severity, client_name: clientName });
      if (!alive()) return; // signed out meanwhile: no navigation into the previous user's ticket
      nav.replace('TicketDetail', { ticketId: created.id });
    } catch (e) {
      if (!alive()) return;
      setServerError(getErrorMessage(e)); // 422 / 404 / 502 verbatim; the form keeps its input
    } finally {
      submitting.current = false;
    }
  };

  return (
    <Screen scroll keyboardAvoiding edges={['left', 'right', 'bottom']}>
      <View style={styles.form}>
        {serverError ? <Banner message={serverError} testID="ticket-create-error" /> : null}
        <Input label="Title" value={title} onChangeText={setTitle} error={errors.title} maxLength={200} />
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          error={errors.description}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          maxLength={5000}
        />

        <View style={styles.field}>
          <Text size="sm" weight="medium" tone="muted">
            Project
          </Text>
          <Pressable
            onPress={() => setSheet(true)}
            accessibilityRole="button"
            accessibilityLabel={`Project: ${project?.name ?? 'not selected'}. Change project`}
            style={[styles.select, { minHeight: t.minTouch, borderColor: errors.project_id ? t.colors.danger.base : t.colors.fieldBorder, borderRadius: t.radius.xl, backgroundColor: t.colors.surface }]}
          >
            {project ? <Dot color={project.color} size={10} /> : null}
            <Text style={[styles.flex1, !project && { color: t.colors.placeholder }]}>{project?.name ?? 'Select a project'}</Text>
            <Icon name="chevron-down" size={20} tone="subtle" />
          </Pressable>
          {errors.project_id ? (
            <Text size="xs" tone="danger" accessibilityLiveRegion="polite">
              {errors.project_id}
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text size="sm" weight="medium" tone="muted">
            Severity
          </Text>
          <ChoiceChips
            accessibilityLabel="Severity"
            value={severity}
            onChange={setSeverity}
            options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] ?? String(s), testID: `severity-${s}` }))}
          />
          {errors.severity ? (
            <Text size="xs" tone="danger">
              {errors.severity}
            </Text>
          ) : null}
        </View>

        <Input label="Client name (optional)" helper="Used only if the project has no client." value={clientName} onChangeText={setClientName} maxLength={150} />

        <Button label="Create ticket" onPress={() => void submit()} loading={create.isPending} />
      </View>

      <BottomSheet visible={sheet} title="Select project" onClose={() => setSheet(false)} scroll={false}>
        <View style={styles.sheet}>
          {projects.isLoading ? <LoadingState label="Loading projects..." /> : null}
          {projects.isError && !projects.data ? <ErrorState message={getErrorMessage(projects.error)} onRetry={() => void projects.refetch()} /> : null}
          <FlatList
            data={projects.data ?? []}
            keyExtractor={(p) => String(p.id)}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <OptionRow
                label={item.name}
                leading={<Dot color={item.color} size={10} />}
                selected={item.id === projectId}
                onPress={() => {
                  setProjectId(item.id);
                  setSheet(false);
                }}
              />
            )}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  form: { gap: 16, paddingBottom: 24 },
  field: { gap: 4 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 12 },
  sheet: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
