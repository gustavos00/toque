// Minimal Google Calendar v3 REST client over fetch.
import type { CalendarEventBody } from "./events";

const API_BASE = "https://www.googleapis.com/calendar/v3";

/** What the sync needs from Google. Tests inject a fake. */
export interface GoogleCalendarClient {
  /** null when the calendar no longer exists (deleted by the user in Google). */
  getCalendar(calendarId: string): Promise<{ id: string } | null>;
  createCalendar(input: { summary: string; timeZone: string }): Promise<{ id: string }>;
  /** 404/410 count as success. */
  deleteCalendar(calendarId: string): Promise<void>;
  insertEvent(calendarId: string, body: CalendarEventBody): Promise<{ id: string }>;
  /** null when the event is gone in Google (the caller recreates it). */
  updateEvent(calendarId: string, eventId: string, body: CalendarEventBody): Promise<{ id: string } | null>;
  /** 404/410 count as success. */
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/** Error from the Calendar API; never includes the access token. */
export class GoogleCalendarError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Google Calendar respondeu ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "GoogleCalendarError";
  }
}

type ClientOptions = {
  /** Returns a valid access token; `forceRefresh` after a 401. null = not connected. */
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
  fetch?: typeof fetch;
};

export function createGoogleCalendarClient(options: ClientOptions): GoogleCalendarClient {
  const doFetch = options.fetch ?? fetch;

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const send = async (forceRefresh: boolean) => {
      const token = await options.getAccessToken({ forceRefresh });
      if (!token) throw new GoogleCalendarError(401, "sem ligação ao Google");
      return doFetch(`${API_BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    };
    const response = await send(false);
    // One refresh on 401 (expired/revoked token), then give up.
    return response.status === 401 ? send(true) : response;
  }

  async function readJson<T>(response: Response): Promise<T> {
    if (!response.ok) throw await createError(response);
    return (await response.json()) as T;
  }

  async function createError(response: Response) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    return new GoogleCalendarError(response.status, detail);
  }

  const isGone = (status: number) => status === 404 || status === 410;
  const encode = encodeURIComponent;

  return {
    async getCalendar(calendarId) {
      const response = await request("GET", `/calendars/${encode(calendarId)}`);
      if (isGone(response.status)) return null;
      const { id } = await readJson<{ id: string }>(response);
      return { id };
    },
    async createCalendar(input) {
      const { id } = await readJson<{ id: string }>(await request("POST", "/calendars", input));
      return { id };
    },
    async deleteCalendar(calendarId) {
      const response = await request("DELETE", `/calendars/${encode(calendarId)}`);
      if (!response.ok && !isGone(response.status)) throw await createError(response);
    },
    async insertEvent(calendarId, body) {
      const { id } = await readJson<{ id: string }>(await request("POST", `/calendars/${encode(calendarId)}/events`, body));
      return { id };
    },
    async updateEvent(calendarId, eventId, body) {
      const response = await request("PUT", `/calendars/${encode(calendarId)}/events/${encode(eventId)}`, body);
      if (isGone(response.status)) return null;
      const { id } = await readJson<{ id: string }>(response);
      return { id };
    },
    async deleteEvent(calendarId, eventId) {
      const response = await request("DELETE", `/calendars/${encode(calendarId)}/events/${encode(eventId)}`);
      if (!response.ok && !isGone(response.status)) throw await createError(response);
    },
  };
}
