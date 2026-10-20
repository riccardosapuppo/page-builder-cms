// A section's picture, in its Background group (./groups.tsx): a picture
// of the library behind the section's columns, chosen or replaced in the
// media library and taken out; with one, its veil, the veil's strength and
// the point kept in view (./StyleFields.tsx, per device as every style
// setting is), and how the words read on it (VeilCheck). The picture is
// one for every device, as an image's source is; it is decorative, so the
// library asks no alt text for it.
import { useId, useMemo, useRef, useState } from "react";
import { makeSetPicture } from "../../document/commands.ts";
import { sectionPicture } from "../../render/media.tsx";
import type { SectionBlock, VeilStrengthToken, VeilToken } from "../../shared/document.ts";
import { slotTone } from "../../shared/site-tokens.ts";
import { veilContrast, VEIL_STRENGTH_DEFAULT } from "../../shared/veil.ts";
import { afterRender } from "../act.ts";
import { ServerErrors } from "../controls.tsx";
import { useEnv, useRun, useUi } from "../context.tsx";
import { deviceOf, shownValue } from "../device-style.ts";
import { Icon } from "../icons.tsx";
import { mediaResolver } from "../media.ts";
import { ImagePicker } from "../pickers.tsx";
import { contrastWords } from "../SiteStylePanel.tsx";
import { StyleFields } from "./StyleFields.tsx";

// A section's Background group: its colour, then its picture, and with
// one the veil, the veil's strength while the veil shown is one, how the
// words read on it, and the point kept in view.
export function SectionBackground({ block }: { block: SectionBlock }) {
  const preview = useUi((u) => u.preview);
  const veiled = (shownValue(block.style, deviceOf(preview), "veil") ?? "none") !== "none";
  return (
    <>
      <StyleFields block={block} keys={["background"]} />
      <SectionPictureField block={block} />
      {block.props.picture !== undefined && (
        <>
          <StyleFields block={block} keys={veiled ? ["veil", "veilStrength"] : ["veil"]} />
          <VeilCheck block={block} />
          <StyleFields block={block} keys={["focus"]} />
        </>
      )}
    </>
  );
}

export function SectionPictureField({ block }: { block: SectionBlock }) {
  const { store } = useEnv();
  const run = useRun();
  const id = useId();
  const media = useUi((u) => u.media);
  const chosen = block.props.picture?.mediaId;
  // A picture this tab has not seen yet, while the library is read again.
  const looking = useUi((u) => chosen !== undefined && u.mediaLooking.has(chosen));
  const shown = useMemo(() => sectionPicture(block.props as Record<string, unknown>, mediaResolver(media)), [block.props, media]);
  const [picking, setPicking] = useState(false);
  const choose = useRef<HTMLButtonElement>(null);
  const set = (mediaId: string | null) => run(makeSetPicture(store.getState().document, block.id, mediaId));
  return (
    <div className="field" role="group" aria-labelledby={`${id}-label`}>
      <span className="label" id={`${id}-label`}>Picture</span>
      {chosen !== undefined && (shown
        ? <img className="thumb-wide" src={shown.src} alt="" />
        : <p className="hint">{looking ? "Looking for the picture in the media library…" : "The picture is not in the media library any more: the section draws none."}</p>)}
      <div className="pic-keys">
        <button ref={choose} className="btn btn-secondary" type="button" onClick={() => setPicking(true)}>{chosen === undefined ? "Choose a picture" : "Replace picture"}</button>
        {chosen !== undefined && (
          <button
            className="btn btn-quiet"
            type="button"
            onClick={() => {
              // The key goes with the picture: the focus goes to Choose.
              if (set(null) === null) afterRender(() => choose.current?.focus());
            }}
          >
            Remove picture
          </button>
        )}
      </div>
      <p className="hint">
        {chosen === undefined
          ? "A picture of the library behind the section’s columns, covering it, under a veil so the words read."
          : "Behind the section’s columns, covering it, on every device. Decorative: the words over it say what matters."}
      </p>
      <ServerErrors blockId={block.id} fields={["/props/picture", "/props/picture/mediaId"]} />
      {picking && (
        <ImagePicker
          confirm="Use picture"
          libraryOnly
          decorative
          onClose={() => setPicking(false)}
          onPick={([next]) => {
            if (next?.mediaId === undefined) return null;
            const error = set(next.mediaId);
            if (!error) setPicking(false);
            return error;
          }}
        />
      )}
    </div>
  );
}

// How the words read on the veiled picture, on the device previewed: the
// words' colour against the veil laid over the picture where the picture
// is worst for them, white under a veil that darkens, black under one that
// lightens (../../shared/veil.ts), as a colour's contrast is said.
export function VeilCheck({ block }: { block: SectionBlock }) {
  const preview = useUi((u) => u.preview);
  const siteStyle = useUi((u) => u.siteStyle);
  const device = deviceOf(preview);
  const veil = (shownValue(block.style, device, "veil") ?? "none") as VeilToken;
  const strength = (shownValue(block.style, device, "veilStrength") ?? VEIL_STRENGTH_DEFAULT) as VeilStrengthToken;
  if (veil === "none") {
    return (
      <ul className="checks" aria-label="Veil: contrast">
        <li className="fail"><Icon name="warning" />No veil: whether the words read depends on the picture.</li>
      </ul>
    );
  }
  const site = { text: slotTone("text", siteStyle?.palette).hex, background: slotTone("background", siteStyle?.palette).hex };
  const { ratio, worst } = veilContrast(veil, strength, site);
  const check = contrastWords(ratio);
  return (
    <ul className="checks" aria-label="Veil: contrast">
      <li className={check.passes ? "pass" : "fail"}>
        <Icon name={check.passes ? "check" : "warning"} />Words on the picture, where it is {worst === "white" ? "lightest" : "darkest"}: {check.words}
      </li>
    </ul>
  );
}
