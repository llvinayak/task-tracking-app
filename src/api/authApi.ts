import { get, post } from './client';
import type { ApiUser, LoginPayload, LoginResult } from './types';

/** POST /auth/login -> data: { user, token } (authController.login). */
export const login = (payload: LoginPayload) => post<LoginResult>('/auth/login', payload);

/** GET /auth/me -> data: user (authController.getMe). */
export const getMe = () => get<ApiUser>('/auth/me');
