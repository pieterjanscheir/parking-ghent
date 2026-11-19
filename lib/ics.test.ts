import { describe, expect, it } from "vitest";
import { reminderIcs } from "./ics";

const event = {
  uid: "1795100000000@parked.ghent-parking",
  title: "Parking runs out",
  description: "Back at the car by 18:30.",
  at: Date.UTC(2026, 10, 19, 17, 30),
  alertMinutesBefore: 10,
  now: Date.UTC(2026, 10, 19, 15, 0, 5),
};

describe("reminderIcs", () => {
  it("makes one event with an alert before it", () => {
    const lines = reminderIcs(event).split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("UID:1795100000000@parked.ghent-parking");
    expect(lines).toContain("DTSTAMP:20261119T150005Z");
    expect(lines).toContain("DTSTART:20261119T173000Z");
    expect(lines).toContain("DTEND:20261119T173500Z");
    expect(lines).toContain("SUMMARY:Parking runs out");
    expect(lines).toContain("TRIGGER:-PT10M");
    expect(lines.filter((line) => line === "BEGIN:VALARM")).toHaveLength(1);
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines.at(-1)).toBe("");
  });

  it("escapes commas, semicolons, backslashes and line breaks", () => {
    const ics = reminderIcs({ ...event, description: "Level -2; row C, bay 4\\5\nBring the ticket" });
    expect(ics).toContain("DESCRIPTION:Level -2\; row C\\, bay 4\\\\5\\nBring the ticket");
  });

  it("folds long lines and keeps every line short", () => {
    const ics = reminderIcs({ ...event, description: "é".repeat(150) });
    const lines = ics.split("\r\n");
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding gives the text back.
    expect(ics.replace(/\r\n /g, "")).toContain(`DESCRIPTION:${"é".repeat(150)}`);
  });
});
