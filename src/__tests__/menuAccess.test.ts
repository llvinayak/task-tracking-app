import type { MyMenu } from '@/api/types';
import { createMenuAccess, getMobileMenus } from '@/hooks/menuAccess';

const menu = (over: Partial<MyMenu> & Pick<MyMenu, 'id' | 'menu_url'>): MyMenu => ({
  menu_name: over.menu_url ?? 'x',
  menu_icon: null,
  parent_id: null,
  is_visible_on_mobile: true,
  sequence: over.id,
  can_edit: false,
  access_level: 'read',
  ...over,
});

const menus: MyMenu[] = [
  menu({ id: 1, menu_url: '/dashboard' }),
  menu({ id: 2, menu_url: '/tasks', can_edit: true, access_level: 'edit' }),
  menu({ id: 3, menu_url: '/tickets', can_edit: true, access_level: 'edit' }),
];

describe('createMenuAccess', () => {
  const dev = createMenuAccess(menus, 5);

  it('canView is true for any granted url', () => {
    expect(dev.canView('/dashboard')).toBe(true);
    expect(dev.canView('/nope', '/tasks')).toBe(true);
    expect(dev.canView('/users')).toBe(false);
  });

  it('canEdit needs can_edit on a matching menu', () => {
    expect(dev.canEdit('/dashboard')).toBe(false);
    expect(dev.canEdit('/tasks')).toBe(true);
    expect(dev.canEdit('/dashboard', '/tickets')).toBe(true);
  });

  it('levelOf returns none | read | edit', () => {
    expect(dev.levelOf('/users')).toBe('none');
    expect(dev.levelOf('/dashboard')).toBe('read');
    expect(dev.levelOf('/tasks')).toBe('edit');
  });

  it('CTO (role 1) always gets /menu-access, even with no grants', () => {
    const cto = createMenuAccess([], 1);
    expect(cto.canView('/menu-access')).toBe(true);
    expect(cto.canEdit('/menu-access')).toBe(true);
    expect(cto.levelOf('/menu-access')).toBe('edit');
    // ...but nothing else: CTO is bound by grants elsewhere (as on the server).
    expect(cto.canView('/users')).toBe(false);
    expect(cto.levelOf('/tasks')).toBe('none');
  });

  it('non-CTO roles do not get the /menu-access recovery path', () => {
    expect(createMenuAccess([], 2).canView('/menu-access')).toBe(false);
    expect(createMenuAccess([], undefined).levelOf('/menu-access')).toBe('none');
  });

  it('ignores menus without a url', () => {
    const a = createMenuAccess([menu({ id: 9, menu_url: null })], 5);
    expect(a.canView('/dashboard')).toBe(false);
  });
});

describe('getMobileMenus', () => {
  it('drops is_visible_on_mobile === false and url-less menus, keeps null as visible', () => {
    const list = getMobileMenus([
      menu({ id: 3, menu_url: '/c', sequence: 3 }),
      menu({ id: 1, menu_url: '/a', sequence: 1, is_visible_on_mobile: false }),
      menu({ id: 2, menu_url: '/b', sequence: 2, is_visible_on_mobile: null }),
      menu({ id: 4, menu_url: null, sequence: 4 }),
    ]);
    expect(list.map((m) => m.menu_url)).toEqual(['/b', '/c']);
  });

  it('orders by sequence then id', () => {
    const list = getMobileMenus([
      menu({ id: 5, menu_url: '/e', sequence: 2 }),
      menu({ id: 4, menu_url: '/d', sequence: 2 }),
      menu({ id: 9, menu_url: '/z', sequence: 1 }),
    ]);
    expect(list.map((m) => m.menu_url)).toEqual(['/z', '/d', '/e']);
  });
});
