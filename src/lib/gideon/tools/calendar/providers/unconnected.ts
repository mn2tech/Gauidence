import type {
  CalendarEvent,
  CalendarProvider,
  CalendarRange,
  CalendarWriteInput,
  TimeSlot,
} from "../types";

/** Default provider until Google Calendar (then Microsoft 365) is connected. */
export const unconnectedCalendarProvider: CalendarProvider = {
  id: "unconnected",
  label: "Not connected",
  async isConnected() {
    return false;
  },
  async getEvents(_range: CalendarRange): Promise<CalendarEvent[]> {
    return [];
  },
  async findAvailableTime(): Promise<TimeSlot[]> {
    return [];
  },
  async createEvent(_input: CalendarWriteInput): Promise<CalendarEvent> {
    throw new Error("Calendar is not connected.");
  },
  async updateEvent(): Promise<CalendarEvent> {
    throw new Error("Calendar is not connected.");
  },
};
