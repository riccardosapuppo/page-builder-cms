// What the tests of scheduled publishing share: a time a few seconds ahead
// as the Schedule… dialog takes it and the editor says it, in the site's
// time zone (cms/config/site.yml: Europe/London, while the tests' browser
// runs in UTC), and a publish set through that dialog as a person sets it.
import type { Page } from "@playwright/test";
import { expect } from "./site.ts";

export const SITE_ZONE = "Europe/London";

export interface SiteTime {
  // The instant, in ms, a whole second.
  instant: number;
  // "Oct 4, 2026", as the dialog's Date field takes it.
  date: string;
  // "4:25:13 PM", as its Time field takes it (no ":00" for a whole minute).
  time: string;
  // "Oct 4 at 4:25:13 PM", as its button and the top bar say it.
  said: string;
}

// A whole second `ms` from now, in the site's zone. The seconds are kept:
// the dialog reads them, and a schedule a few seconds ahead needs them.
export function siteTime(ms: number): SiteTime {
  const instant = Math.ceil((Date.now() + ms) / 1000) * 1000;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: SITE_ZONE, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  }).formatToParts(instant).map((p) => [p.type, p.value]));
  const day = `${parts.month} ${parts.day}`;
  const time = `${parts.hour}:${parts.minute}${parts.second === "00" ? "" : `:${parts.second}`} ${parts.dayPeriod}`;
  return { instant, date: `${day}, ${parts.year}`, time, said: `${day} at ${time}` };
}

// Publish menu › Schedule…, the two fields, and the dialog's own button.
export async function schedule(page: Page, when: SiteTime): Promise<void> {
  await page.getByRole("button", { name: "More publish options" }).click();
  await page.getByRole("menu", { name: "Publish options" }).getByRole("menuitem", { name: /^Schedule…/ }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule your changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Date").fill(when.date);
  await dialog.getByLabel("Time").fill(when.time);
  await dialog.getByRole("button", { name: `Schedule for ${when.said}` }).click();
  await expect(dialog).toBeHidden();
}
