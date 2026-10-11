import { get } from './client';
import type { MyMenu } from './types';

/** GET /menu-access/my -> data: MyMenu[] (menuController.getMyMenus). */
export const getMyMenus = () => get<MyMenu[]>('/menu-access/my');
