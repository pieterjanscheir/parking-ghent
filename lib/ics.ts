// A one-event calendar file (iCalendar, RFC 5545) with an alert before it.
// Opening it adds the event to the phone's own calendar, which then does the
// reminding — the only way this site can alert someone while it is closed,
// without a server sending notifications.

const pad = (n: number) => String(n).padStart(2, "0");

// 20261119T173000Z
function utcStamp(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Lines may be 75 bytes at most; longer ones continue on a line that starts
// with a space. Counted in bytes, not letters: "é" takes two, an emoji four.
const MAX_LINE_BYTES = 73;
const encoder = new TextEncoder();

function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // Iterating a string goes letter by letter, never through half an emoji.
  for (const letter of line) {
    const size = encoder.encode(letter).length;
    if (bytes + size > MAX_LINE_BYTES) {
      parts.push(current);
      current = "";
      // The continuation's leading space counts too.
      bytes = 1;
    }
    current += letter;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function reminderIcs(event: {
  // Must be stable for the same reminder, so adding it twice updates it.
  uid: string;
  title: string;
  description: string;
  // When the event is (epoch ms).
  at: number;
  // How long before `at` the phone should alert.
  alertMinutesBefore: number;
  // When the file is made (epoch ms).
  now: number;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ghent Parking//Parking reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(event.now)}`,
    `DTSTART:${utcStamp(event.at)}`,
    `DTEND:${utcStamp(event.at + 5 * 60_000)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(event.title)}`,
    `TRIGGER:-PT${Math.max(0, Math.round(event.alertMinutesBefore))}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
