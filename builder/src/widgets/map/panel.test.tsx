// The map's panel: label, latitude, longitude and zoom change the page by
// the map's props command; a value out of range is refused on its field;
// the server's 422 on a coordinate shows on that field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

const commit = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
  return field;
};

test("label and point change the map", () => {
  const kit = editorKit({ document: widgetPage(), selection: "map" });
  kit.render(<BlockPanel id="map" />);
  commit("Label", "The north slipway");
  commit("Latitude", "57.3009");
  commit("Longitude", "-1.9497");
  commit("Zoom", "15");
  expect(kit.block("map")?.props).toEqual({ latitude: 57.3009, longitude: -1.9497, zoom: 15, label: "The north slipway" });
  expect(kit.store.getState().past.map((entry) => entry.command.label)).toEqual([
    "Changed Map label in Widgets", "Changed Map in Widgets", "Changed Map in Widgets", "Changed Map in Widgets",
  ]);
});

test("a latitude past the pole and a zoom that is not whole are refused on their fields", () => {
  const kit = editorKit({ document: widgetPage(), selection: "map" });
  kit.render(<BlockPanel id="map" />);
  const latitude = commit("Latitude", "91");
  expect(describedText(latitude)).toContain("From -90 to 90.");
  const zoom = commit("Zoom", "13.5");
  expect(describedText(zoom)).toContain("Write a whole number.");
  expect(kit.block("map")?.props).toMatchObject({ latitude: 54.5, zoom: 13 });
});

test("the server's 422 on the longitude shows on the Longitude field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "map" });
  kit.render(<BlockPanel id="map" />);
  act(() => kit.refuse("map", "/props/longitude", "maximum", "must be at most 180"));
  const longitude = screen.getByLabelText("Longitude");
  expect(longitude.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(longitude)).toContain("From -180 to 180.");
  expect(screen.getByLabelText("Latitude").getAttribute("aria-invalid")).toBeNull();
});
