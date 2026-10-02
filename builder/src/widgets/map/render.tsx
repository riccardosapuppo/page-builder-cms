// A map of a point, loaded only when the visitor opens it: the twin of
// cms/app/views/blocks/_map.html.erb, the same <details> and lazy iframe as
// the video. The closed card is the theme's drawing with a pin and the
// block's label, and never names the provider. Coordinates or a zoom the
// policy refuses (out of range, written as strings) leave the block empty.
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { mapSrc } from "../../render/policy.ts";
import { visibilityClasses } from "../../render/style.ts";

export function MapRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const src = mapSrc(props.latitude, props.longitude, props.zoom);
  const label = propText(props, "label");
  return (
    <BlockRoot block={block} classes={["w", "w-map", visibilityClasses(blockStyle(block))]} decoration={decoration}>
      {src !== null && (
        <details className="sw-embed sw-map">
          <summary className="sw-embed-load">
            <span className="sw-embed-media sw-map-poster"><span className="sw-map-pin" /></span>
            <span className="sw-embed-bar sw-embed-bar-row">
              <span className="sw-embed-label">{label}</span>
              <span className="sw-btn sw-btn-small"><span className="sw-when-closed">Load map</span><span className="sw-when-open">Hide map</span></span>
            </span>
          </summary>
          <div className="sw-embed-frame sw-embed-frame-map">
            <iframe src={src} title={`Map: ${label}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          </div>
        </details>
      )}
    </BlockRoot>
  );
}
