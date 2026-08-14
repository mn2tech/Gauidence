/**
 * Calendar tool types. Gideon talks to CalendarService, never to a vendor SDK.
 */

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
};

export type TimeSlot = {
  start: string;
  end: string;
};

export type CalendarRange = {
  start: Date;
  end: Date;
};

export type CalendarWriteInput = {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
};

export type CalendarReadResult =
  | { ok: true; connected: true; events: CalendarEvent[] }
  | { ok: false; connected: false; reason: "not_connected"; events: [] };

export type CalendarAvailabilityResult =
  | { ok: true; connected: true; slots: TimeSlot[] }
  | { ok: false; connected: false; reason: "not_connected"; slots: [] };

export type CalendarWriteResult =
  | { ok: true; event: CalendarEvent }
  | {
      ok: false;
      reason: "not_connected" | "confirmation_required" | "not_implemented";
    };

export interface CalendarProvider {
  readonly id: string;
  readonly label: string;
  isConnected(): Promise<boolean>;
  getEvents(range: CalendarRange): Promise<CalendarEvent[]>;
  findAvailableTime(args: {
    durationMinutes: number;
    range: CalendarRange;
  }): Promise<TimeSlot[]>;
  createEvent(input: CalendarWriteInput): Promise<CalendarEvent>;
  updateEvent(
    id: string,
    input: Partial<CalendarWriteInput>
  ): Promise<CalendarEvent>;
}
