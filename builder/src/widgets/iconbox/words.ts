// The site's icons in words (schema/icons.svg): the name the icon box's
// picker gives each, what each shows (the Assistant's question names it
// for a model to pick one, and the picker's search reads it), and the
// order the picker lists them in, the site's own first, then Lucide's by
// what they are for.
import type { IconName } from "../../shared/document.ts";

export const ICON_LABELS: Readonly<Record<IconName, string>> = {
  sunrise: "Sunrise", buoys: "Buoys", cup: "Cup", calendar: "Calendar", clock: "Clock", pin: "Pin", globe: "Globe", info: "Info",
  accessibility: "Accessibility", activity: "Activity", award: "Award", baby: "Baby", bike: "Bike", "book-open": "Book",
  briefcase: "Briefcase", "building-2": "Building", "calendar-days": "Days", camera: "Camera", "circle-check": "Check",
  dumbbell: "Dumbbell", flame: "Flame", gift: "Gift", "graduation-cap": "Graduation", "heart-pulse": "Heartbeat", house: "House",
  leaf: "Leaf", lightbulb: "Light bulb", mail: "Mail", moon: "Moon", music: "Music", palette: "Palette", phone: "Phone",
  rocket: "Rocket", scissors: "Scissors", "shield-check": "Shield", "shopping-bag": "Shopping bag", "square-parking": "Parking",
  star: "Star", sun: "Sun", target: "Target", ticket: "Ticket", timer: "Timer", trophy: "Trophy", "user-round": "Person",
  users: "People", utensils: "Cutlery", wifi: "Wireless", zap: "Lightning",
};

// What each icon shows, and what it may stand for.
export const ICON_WORDS: Readonly<Record<IconName, string>> = {
  sunrise: "a sunrise: mornings, a start, a new season",
  buoys: "buoys on the water: the sea, swimming, a route",
  cup: "a cup: a drink, a café, a pause",
  calendar: "a calendar: a date, an event, a season",
  clock: "a clock: a time, opening hours, how long",
  pin: "a map pin: a place, an address, where to meet",
  globe: "a globe: the world, travel, languages",
  info: "an i: information, a note, anything else",
  accessibility: "a person moving freely: access for everyone, accessibility",
  activity: "a pulse line: activity, cardio, heart rate, energy",
  award: "a rosette with ribbons: an award, a prize, a certificate",
  baby: "a baby's face: babies, families, children",
  bike: "a bicycle: cycling, spinning, getting around",
  "book-open": "an open book: learning, reading, a guide, a course",
  briefcase: "a briefcase: work, business, professionals",
  "building-2": "an office building: a company, offices, a venue",
  "calendar-days": "a calendar of days: a timetable, a schedule, bookings",
  camera: "a camera: photos, a studio, memories",
  "circle-check": "a tick in a circle: included, done, guaranteed",
  dumbbell: "a dumbbell: strength training, weights, a gym",
  flame: "a flame: burning calories, intensity, heat",
  gift: "a wrapped gift: a present, a voucher, an offer",
  "graduation-cap": "a graduation cap: training, qualifications, a school",
  "heart-pulse": "a heart with a pulse: health, cardio, wellbeing",
  house: "a house: home, at home, a place to live",
  leaf: "a leaf: nature, green, natural food",
  lightbulb: "a light bulb: an idea, advice, tips",
  mail: "an envelope: email, write to us, a newsletter",
  moon: "a crescent moon: evenings, nights, rest, sleep",
  music: "musical notes: music, dance, a concert",
  palette: "a painter's palette: art, design, creativity, colours",
  phone: "a telephone: call us, a phone number, contact",
  rocket: "a rocket: a launch, fast results, a fresh start",
  scissors: "scissors: a haircut, crafts, cutting",
  "shield-check": "a shield with a tick: safety, security, insurance, trust",
  "shopping-bag": "a shopping bag: a shop, buying, products",
  "square-parking": "a P sign: parking",
  star: "a star: a favourite, quality, ratings, the best",
  sun: "a sun: daytime, summer, outdoors",
  target: "a target: goals, aims, precision",
  ticket: "a ticket: entry, an event, a pass",
  timer: "a stopwatch: timing, intervals, a quick session",
  trophy: "a trophy: winning, a competition, achievements",
  "user-round": "a person: one person, personal coaching, a member",
  users: "two people: a group, a team, classes, a community",
  utensils: "a fork and a knife: food, a restaurant, meals, nutrition",
  wifi: "a wireless signal: internet, online, connected",
  zap: "a lightning bolt: energy, power, speed",
};

// The picker's order: the site's own eight, then Lucide's forty grouped by
// what they are for.
export const ICON_GROUPS: ReadonlyArray<{ name: string; icons: readonly IconName[] }> = [
  { name: "The site's own", icons: ["sunrise", "buoys", "cup", "calendar", "clock", "pin", "globe", "info"] },
  { name: "People", icons: ["user-round", "users", "baby", "accessibility", "graduation-cap", "briefcase"] },
  { name: "Sport and health", icons: ["dumbbell", "activity", "heart-pulse", "bike", "timer", "trophy", "award", "target", "flame", "zap"] },
  { name: "Places and services", icons: ["house", "building-2", "square-parking", "wifi", "phone", "mail", "utensils", "shopping-bag", "ticket"] },
  { name: "Things", icons: ["book-open", "music", "palette", "camera", "scissors", "gift", "lightbulb", "rocket", "shield-check", "circle-check"] },
  { name: "Nature and time", icons: ["sun", "moon", "leaf", "star", "calendar-days"] },
];

// The icons whose name or words hold every word of `query`, in the
// picker's order; all of them for no query.
export function findIcons(query: string): IconName[] {
  const asked = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== "");
  return ICON_GROUPS.flatMap((group) => group.icons).filter((icon) => {
    const said = `${ICON_LABELS[icon]} ${icon} ${ICON_WORDS[icon]} ${ICON_GROUPS.find((group) => group.icons.includes(icon))?.name ?? ""}`.toLowerCase();
    return asked.every((word) => said.includes(word));
  });
}
