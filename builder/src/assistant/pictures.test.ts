// What pictures made for a page are (./pictures.ts): photos with OpenAI's
// key, illustrations with Anthropic's; each shape's size, the GPT Image
// models' standard three, and an illustration's viewBox of the same shape;
// what a picture's bytes are; and the name it is uploaded under.
import { expect, test } from "vitest";
import { PICTURE_KINDS, PICTURE_SIZES, pictureName, sizeName, sniffImage, VIEW_BOXES } from "./pictures.ts";
import { PLAN_SHAPES } from "./plan.ts";

test("OpenAI's key makes photos and Anthropic's draws illustrations; each shape has its size, and an illustration's viewBox its proportions", () => {
  expect(PICTURE_KINDS).toEqual({ anthropic: "illustration", openai: "photo" });
  expect(PLAN_SHAPES.map(sizeName)).toEqual(["1536x1024", "1024x1024", "1024x1536"]);
  for (const shape of PLAN_SHAPES) {
    const [, , width, height] = VIEW_BOXES[shape].split(" ").map(Number);
    expect(width! / height!, shape).toBeCloseTo(PICTURE_SIZES[shape].width / PICTURE_SIZES[shape].height);
  }
});

test("a picture's bytes are a WebP, a PNG or a JPEG by their first ones, or none of them", () => {
  const bytes = (...values: Array<number | string>) => new Uint8Array(values.flatMap((value) => (typeof value === "string" ? [...value].map((c) => c.charCodeAt(0)) : [value])));
  expect(sniffImage(bytes("RIFF", 1, 2, 3, 4, "WEBPVP8 "))).toBe("image/webp");
  expect(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
  expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  for (const other of [bytes("GIF89a"), bytes("<svg xmlns"), bytes("RIFF", 1, 2, 3, 4, "WAVE"), bytes()]) expect(sniffImage(other)).toBeNull();
});

test("a picture is named after the page and what it shows, in lower case, cut short", () => {
  expect(pictureName("Modern fitness gym", "A coach guiding a squat, the rack behind", "image/webp")).toBe("modern-fitness-gym-a-coach-guiding-a-squat-the-rack-behind.webp");
  expect(pictureName("Café Ölberg", "Ünïcode & more!", "image/png")).toBe("cafe-olberg-unicode-more.png");
  expect(pictureName("", "", "image/jpeg")).toBe("picture.jpg");
  expect(pictureName("word ".repeat(40), "what", "image/webp").length).toBeLessThanOrEqual(80);
});
