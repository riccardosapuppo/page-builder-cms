// About (design/shots-extra/about.png): the mark, the product's name and
// version, and who made it. Opened from the mark's menu. The version is the
// editor's package's, which About.test.tsx holds to the repository's.
import { version } from "../../package.json";
import { Dialog } from "./dialog.tsx";
import { useEnv, useUi } from "./context.tsx";
import { Mark } from "./icons.tsx";

export const ABOUT_LINE = `Page Builder CMS ${version} — Developed by Riccardo Sapuppo`;

export function AboutDialog() {
  const open = useUi((u) => u.aboutOpen);
  const { ui } = useEnv();
  if (!open) return null;
  const close = () => ui.getState().setAboutOpen(false);
  return (
    <Dialog
      title="About"
      className="dlg-about"
      onClose={close}
      plain={{ lead: <Mark size={48} /> }}
      footer={<button className="btn btn-secondary" type="button" data-autofocus onClick={close}>Close</button>}
    >
      <p className="about-line">{ABOUT_LINE}</p>
    </Dialog>
  );
}
