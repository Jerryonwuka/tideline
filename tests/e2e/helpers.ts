import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const randomPhone = () => `0803${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
export const e164 = (local: string) => `+234${local.slice(1)}`;

export async function outbox(request: APIRequestContext, phone: string) {
  const res = await request.get(`/api/dev/outbox?phone=${encodeURIComponent(e164(phone))}`);
  expect(res.ok(), "dev outbox must be enabled (APP_ENV=local, INTEGRATIONS_MODE=fake)").toBe(true);
  return (await res.json()) as {
    otps: string[];
    messages: { channel: string; text?: string; params?: string[]; buttons?: { id: string; title: string }[] }[];
  };
}

/** Signs in on /login with the code delivered to the fake messaging outbox. */
export async function logIn(page: Page, phone: string) {
  const before = (await outbox(page.request, phone)).otps.length;
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  let code = "";
  await expect
    .poll(async () => {
      const { otps } = await outbox(page.request, phone);
      code = otps[otps.length - 1] ?? "";
      return otps.length;
    })
    .toBeGreaterThan(before);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** A solid-colour PNG of the given size, built in memory (no fixtures on disk). */
export function makePng(width: number, height: number): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { deflateSync } = require("node:zlib") as typeof import("node:zlib");
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3, 0);
  for (let x = 0; x < width; x++) row.set([30, 90, 200], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** YYYY-MM-DD, days from today (UTC; the tests stay well away from day boundaries). */
export function isoDate(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pins the server's and this page's clocks to 12:00 in Lagos today, so the safety rules (night,
 * permitted hours) give the same answer whenever the tests run. Time keeps moving from there.
 */
export async function pinMidday(page: Page) {
  const lagosDate = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const at = new Date(`${lagosDate}T11:00:00Z`);
  const res = await page.request.post("/api/dev/clock", { data: { at: at.toISOString() } });
  expect(res.ok(), "dev clock must be enabled (APP_ENV=local, INTEGRATIONS_MODE=fake)").toBe(true);
  await page.clock.setSystemTime(at);
}
