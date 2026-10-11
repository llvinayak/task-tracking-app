/**
 * Decouples the API client from the auth store (avoids an import cycle:
 * store -> authApi -> client -> store). The store registers itself at startup.
 */
interface SessionBridge {
  getToken: () => string | null;
  /** Called when a non-/auth request comes back 401 for the CURRENT token. */
  onUnauthorized: () => void;
}

let bridge: SessionBridge = { getToken: () => null, onUnauthorized: () => {} };

export const registerSessionBridge = (next: SessionBridge) => {
  bridge = next;
};

export const getSessionBridge = () => bridge;
