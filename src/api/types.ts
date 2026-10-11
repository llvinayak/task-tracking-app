/** Server user as returned by /auth/login (role_name) and /auth/me (userRole). */
export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role_name?: string;
  userRole?: { id: number; name: string } | null;
  avatar_url?: string | null;
  is_active?: boolean;
  client_id?: number | null;
  is_overloaded?: boolean;
  last_login_at?: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResult {
  user: ApiUser;
  token: string;
}

/** One row of GET /menu-access/my (menuController.getMyMenus). */
export interface MyMenu {
  id: number;
  menu_name: string;
  menu_url: string | null;
  menu_icon: string | null;
  parent_id: number | null;
  is_visible_on_mobile: boolean | null;
  sequence: number;
  can_edit: boolean;
  access_level: 'read' | 'edit';
  is_child?: boolean;
}
