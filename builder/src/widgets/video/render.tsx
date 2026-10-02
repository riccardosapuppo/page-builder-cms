// A video from a provider of the URL policy, loaded only when the visitor
// opens it: the twin of cms/app/views/blocks/_video.html.erb. The page runs
// no script: the player is a lazy iframe inside a closed <details>, and the
// card's picture is the theme's, drawn in CSS. The card says "the
// provider", never a provider's name; the provider id stays in
// data-provider. A provider or an id the policy refuses leaves the block
// empty.
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { ThemeSvg } from "../../render/drawings.tsx";
import { isVideoProvider, videoSrc } from "../../render/policy.ts";
import { visibilityClasses } from "../../render/style.ts";

export function VideoRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const src = videoSrc(props.provider, props.videoId);
  const title = propText(props, "title");
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-video", visibilityClasses(blockStyle(block))]}
      data={{ provider: isVideoProvider(props.provider) ? props.provider : null }}
      decoration={decoration}
    >
      {src !== null && (
        <details className="sw-embed sw-video">
          <summary className="sw-embed-load">
            <span className="sw-embed-media sw-video-poster"><span className="sw-play-dot"><ThemeSvg name="play" className="sw-play-icon" /></span></span>
            <span className="sw-embed-bar">
              <strong>{title}</strong>
              <small className="sw-when-closed">Loads a video from the provider when you click.</small>
              <small className="sw-when-open">Playing from the provider. Click here to close it.</small>
            </span>
          </summary>
          <div className="sw-embed-frame sw-embed-frame-video">
            <iframe
              src={src}
              title={title}
              loading="lazy"
              allow="fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </details>
      )}
    </BlockRoot>
  );
}
