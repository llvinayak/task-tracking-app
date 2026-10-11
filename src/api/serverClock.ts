/**
 * Device-vs-server clock offset, learned from the HTTP `Date` header of any
 * successful response (1s resolution). Used only for display maths such as
 * running-timer elapsed time; never to schedule anything. Without a usable
 * header the offset stays 0 and the device clock is used.
 */
let offsetMs = 0;
let known = false;

/** Called by the API client for every successful response. */
export function noteServerDate(header: unknown, deviceNowMs: number = Date.now()): void {
  if (typeof header !== 'string') return;
  const server = Date.parse(header);
  if (!Number.isFinite(server)) return;
  // The Date header is truncated to whole seconds, so add half a second.
  offsetMs = server + 500 - deviceNowMs;
  known = true;
}

export const getServerOffsetMs = () => offsetMs;
export const hasServerOffset = () => known;
export const serverNowMs = (deviceNowMs: number = Date.now()) => deviceNowMs + offsetMs;
export const resetServerClock = () => {
  offsetMs = 0;
  known = false;
};
