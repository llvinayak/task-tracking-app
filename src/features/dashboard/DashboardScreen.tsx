import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen, SegmentedControl, Text } from '@/components/ui';
import { dashboardViewForRole, type DashboardView } from '@/config/dashboardRoles';
import { useAuthStore } from '@/store/authStore';

import { ClientView, DeveloperView, ProjectManagerView, QAView, TechLeadView } from './views';

type CtoTab = 'pm' | 'health';

function CtoView() {
  const [tab, setTab] = useState<CtoTab>('pm');
  return (
    <View style={styles.flex1}>
      <View style={styles.segment}>
        <SegmentedControl<CtoTab>
          options={[
            { value: 'pm', label: 'Project manager' },
            { value: 'health', label: 'Team health' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'pm' ? <ProjectManagerView /> : <TechLeadView teamHealth />}
    </View>
  );
}

export function ViewForRole({ view }: { view: DashboardView }) {
  switch (view) {
    case 'client':
      return <ClientView />;
    case 'developer':
      return <DeveloperView />;
    case 'qa':
      return <QAView />;
    case 'techLead':
      return <TechLeadView />;
    case 'projectManager':
      return <ProjectManagerView />;
    case 'cto':
      return <CtoView />;
  }
}

/** Dashboards ignore the selected project (as on the web). */
export function DashboardScreen() {
  const roleId = useAuthStore((s) => s.user?.roleId);
  const name = useAuthStore((s) => s.user?.name);
  const view = dashboardViewForRole(roleId);
  return (
    <Screen edges={['top', 'left', 'right']} padded={false}>
      <View style={styles.header}>
        <Text size="2xl" weight="bold" accessibilityRole="header">
          Hi{name ? `, ${name.split(' ')[0]}` : ''}
        </Text>
        <Text tone="muted" size="sm">
          Dashboard
        </Text>
      </View>
      <View style={styles.flex1}>
        <ViewForRole view={view} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 2 },
  segment: { paddingHorizontal: 16, paddingBottom: 4 },
});
