import AsyncStorage from '@react-native-async-storage/async-storage';

import { reconcileSelection, useProjectStore, type SelectedProject } from '@/store/projectStore';

const p = (id: number, over: Partial<SelectedProject> = {}): SelectedProject => ({
  id,
  name: `P${id}`,
  color: '#111111',
  status: 'active',
  product_id: null,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  useProjectStore.setState({ selected: null });
});

describe('projectStore', () => {
  it('defaults to All Projects (null)', () => {
    expect(useProjectStore.getState().selected).toBeNull();
  });

  it('persists the selection to AsyncStorage', async () => {
    useProjectStore.getState().select(p(3, { name: 'Alpha' }));
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('tt-selected-project');
    expect(JSON.parse(raw as string).state.selected).toMatchObject({ id: 3, name: 'Alpha' });
  });

  it('rehydrates a persisted selection', async () => {
    await AsyncStorage.setItem(
      'tt-selected-project',
      JSON.stringify({ state: { selected: p(8, { name: 'Saved' }) }, version: 0 }),
    );
    await useProjectStore.persist.rehydrate();
    expect(useProjectStore.getState().selected).toMatchObject({ id: 8, name: 'Saved' });
  });

  it('reconcile drops a selection that is no longer visible', () => {
    useProjectStore.getState().select(p(5));
    useProjectStore.getState().reconcile([p(1), p(2)]);
    expect(useProjectStore.getState().selected).toBeNull();
  });

  it('reconcile keeps and refreshes a still-visible selection', () => {
    useProjectStore.getState().select(p(2, { name: 'Old name' }));
    useProjectStore.getState().reconcile([p(1), p(2, { name: 'New name', status: 'on_hold' })]);
    expect(useProjectStore.getState().selected).toMatchObject({ id: 2, name: 'New name', status: 'on_hold' });
  });

  it('reconcile leaves "All projects" alone', () => {
    useProjectStore.getState().reconcile([p(1)]);
    expect(useProjectStore.getState().selected).toBeNull();
    expect(reconcileSelection(null, [p(1)])).toBeNull();
  });

  it('clear resets to All Projects', () => {
    useProjectStore.getState().select(p(4));
    useProjectStore.getState().clear();
    expect(useProjectStore.getState().selected).toBeNull();
  });
});
