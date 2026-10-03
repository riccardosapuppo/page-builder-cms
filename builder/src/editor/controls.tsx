// The controls of the property panels, drawn as the approved design draws
// them (design/index.html: .field, .input, .seg, .ruler, .swatches,
// .steps, .toggle), each with its label, its hint and its errors tied to
// it for a screen reader (aria-describedby, aria-invalid).
//
// A control never changes the page itself: it hands the new value to its
// panel, which makes the command and returns the refusal, if any. Text is
// handed over when the person pauses (on the injected clock), leaves the
// field or presses Enter in a one-line field, so a word typed is one change
// in the history, not one per letter.
import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type ReactNode,
} from "react";
import type { CommandError } from "../document/check.ts";
import { useEnv, useUi } from "./context.tsx";
import { explain, refusalAt, serverErrorsAt, type FieldRules } from "./errors.ts";
import { Icon, type IconName } from "./icons.tsx";

// How long typing may pause before the text becomes a change.
export const COMMIT_AFTER_MS = 700;

// ------------------------------------------------ fields a panel shows

// The fields of the panel on screen, so the panel can list the server's
// errors that no field of its own shows (./panels/BlockErrors).
interface Claims {
  claim(field: string): () => void;
}
const ClaimsContext = createContext<Claims | null>(null);

export function useFieldClaims(): { provider: (children: ReactNode) => ReactNode; claimed: ReadonlySet<string> } {
  const [claimed, setClaimed] = useState<ReadonlySet<string>>(new Set());
  const claims = useMemo<Claims>(() => ({
    claim(field) {
      setClaimed((set) => new Set(set).add(field));
      return () => setClaimed((set) => {
        const next = new Set(set);
        next.delete(field);
        return next;
      });
    },
  }), []);
  const provider = useCallback((children: ReactNode) => <ClaimsContext.Provider value={claims}>{children}</ClaimsContext.Provider>, [claims]);
  return { provider, claimed };
}

function useClaim(field: string | undefined): void {
  const claims = useContext(ClaimsContext);
  useEffect(() => (claims && field !== undefined ? claims.claim(field) : undefined), [claims, field]);
}

// The server's errors for a block's field (blockId null: the page's own
// keys), as sentences.
export function useServerErrors(blockId: string | null | undefined, field: string | undefined, rules?: FieldRules): string[] {
  const errors = useUi((u) => u.serverErrors);
  return useMemo(
    () => (blockId === undefined || field === undefined ? [] : serverErrorsAt(errors, blockId, field, rules)),
    [errors, blockId, field, rules],
  );
}

// ------------------------------------------------------- field frame

interface FieldFrameProps {
  id: string;
  label: ReactNode;
  // A label element for a native input; a span named by aria-labelledby
  // for a group.
  labelFor?: boolean;
  scope?: ReactNode;
  hint?: ReactNode;
  errors: readonly string[];
  children: ReactNode;
  className?: string;
}

export function FieldFrame({ id, label, labelFor = true, scope, hint, errors, children, className }: FieldFrameProps) {
  const labelElement = labelFor
    ? <label className="label" htmlFor={id} id={`${id}-label`}>{label}</label>
    : <span className="label" id={`${id}-label`}>{label}</span>;
  return (
    <div className={`field${errors.length > 0 ? " field-error" : ""}${className ? ` ${className}` : ""}`}>
      {scope ? <div className="label-row">{labelElement}<span className="scope">{scope}</span></div> : labelElement}
      {children}
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      <ErrorList id={`${id}-error`} errors={errors} />
    </div>
  );
}

// A field's errors, said as they appear.
export function ErrorList({ id, errors }: { id: string; errors: readonly string[] }) {
  return (
    <div aria-live="polite" id={id}>
      {errors.map((message) => <p className="error" key={message}><Icon name="error" />{message}</p>)}
    </div>
  );
}

export function describedBy(id: string, hint: unknown, errors: readonly string[]): string | undefined {
  const ids = [hint ? `${id}-hint` : null, errors.length > 0 ? `${id}-error` : null].filter((x): x is string => x !== null);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

// ---------------------------------------------------------- text

interface TextFieldProps {
  label: string;
  value: string;
  // Hands the text over; null when the page took it, the refusal otherwise.
  onCommit: (value: string) => CommandError | null;
  // Where the value is: the block (null for the page itself) and the
  // field's pointer inside it ("/props/text"), for the errors.
  blockId: string | null;
  field: string;
  rules?: FieldRules;
  multiline?: boolean;
  // A text area for a value of one line (a heading's text): Enter hands
  // the text over instead of starting a new line.
  oneLine?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: ReactNode;
  icon?: IconName;
  prefix?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  // Values to choose from as the person types (a one-line field): the
  // browser's own list, each value with its name (a page's address, its
  // title). Anything else can still be typed.
  suggestions?: ReadonlyArray<{ value: string; label: string }>;
}

export function TextField({ label, value, onCommit, blockId, field, rules, multiline = false, oneLine = false, rows = 2, placeholder, hint, icon, prefix, autoFocus, disabled, suggestions }: TextFieldProps) {
  const { clock, ui } = useEnv();
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [refusal, setRefusal] = useState<string | null>(null);
  const timer = useRef<unknown>(null);
  // While text waits for its pause, the editor's other commands hand it
  // over first (./pending.ts): this lets go of that hold.
  const release = useRef<(() => void) | null>(null);
  const focused = useRef(false);
  const sent = useRef(value);
  // What a commit hands over when it runs later (a timer, a blur, the panel
  // going away): this render's text and handler, not the first one's.
  const latest = useRef({ draft, onCommit, rules, field });
  useLayoutEffect(() => {
    latest.current = { draft, onCommit, rules, field };
  });
  useClaim(field);
  const server = useServerErrors(blockId, field, rules);

  const commit = useCallback(() => {
    if (timer.current !== null) {
      clock.clearTimeout(timer.current);
      timer.current = null;
    }
    release.current?.();
    release.current = null;
    const { draft: text, onCommit: hand, rules: r, field: f } = latest.current;
    if (text === sent.current) return;
    const error = hand(text);
    if (error) {
      setRefusal(refusalAt(error, f, r));
    } else {
      sent.current = text;
      setRefusal(null);
    }
  }, [clock]);

  // The page changed under the field (another field, a reload): show it,
  // unless the person is typing here.
  useEffect(() => {
    if (focused.current || timer.current !== null) return;
    setDraft(value);
    sent.current = value;
    setRefusal(null);
  }, [value]);

  // Text still waiting when the panel goes (another block selected) is
  // handed over, not lost.
  useEffect(() => () => {
    if (timer.current !== null) commit();
  }, [commit]);

  const errors = refusal ? [refusal, ...server.filter((m) => m !== refusal)] : server;
  const common = {
    id,
    value: draft,
    placeholder,
    autoFocus,
    disabled,
    "aria-invalid": errors.length > 0 ? true : undefined,
    "aria-describedby": describedBy(id, hint, errors),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit();
    },
    onChange: (event: { target: { value: string } }) => {
      // The text handed over by a command elsewhere is this render's, so
      // the latest is set at once, not after the next render.
      latest.current = { ...latest.current, draft: event.target.value };
      setDraft(event.target.value);
      if (timer.current !== null) clock.clearTimeout(timer.current);
      release.current ??= ui.getState().pending.hold(commit);
      timer.current = clock.setTimeout(() => {
        timer.current = null;
        commit();
      }, COMMIT_AFTER_MS);
    },
  };
  let control: ReactNode;
  if (multiline) {
    control = (
      <textarea
        className="input"
        rows={rows}
        {...common}
        onKeyDown={oneLine ? (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        } : undefined}
      />
    );
  } else {
    const input = (
      <input
        type="text"
        className={icon || prefix ? undefined : "input"}
        spellCheck={rules?.kind === "href" || rules?.kind === "anchor" || rules?.kind === "slug" ? false : undefined}
        list={suggestions && suggestions.length > 0 ? `${id}-list` : undefined}
        {...common}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    );
    const listed = suggestions && suggestions.length > 0
      ? <datalist id={`${id}-list`}>{suggestions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</datalist>
      : null;
    control = icon || prefix
      ? <div className="input input-icon">{icon && <Icon name={icon} />}{prefix && <span className="input-prefix" aria-hidden="true">{prefix}</span>}{input}{listed}</div>
      : <>{input}{listed}</>;
  }
  return <FieldFrame id={id} label={label} hint={hint} errors={errors}>{control}</FieldFrame>;
}

// A number, handed over like text; what is not a number is refused here.
interface NumberFieldProps extends Omit<TextFieldProps, "value" | "onCommit" | "multiline"> {
  value: number;
  integer?: boolean;
  onCommit: (value: number) => CommandError | null;
}

export function NumberField({ value, onCommit, integer = false, rules, ...rest }: NumberFieldProps) {
  const numberRules: FieldRules = { kind: "number", ...rules };
  return (
    <TextField
      {...rest}
      rules={numberRules}
      value={String(value)}
      onCommit={(text) => {
        const trimmed = text.trim();
        const parsed = Number(trimmed);
        if (trimmed === "" || !Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
          return { reason: "invalid", message: integer ? "Write a whole number." : "Write a number." };
        }
        return onCommit(parsed);
      }}
    />
  );
}

// ------------------------------------------------- choices of one

export interface Choice<T extends string | number> {
  value: T;
  label: string;
  icon?: IconName;
  // Drawn inside the button in place of the label (the label then names it).
  content?: ReactNode;
  // A swatch's colour.
  color?: string;
  title?: string;
}

// Arrow keys move the choice along a radio group, as a native one does.
function useRadioKeys<T extends string | number>(choices: readonly Choice<T>[], value: T | null, onChange: (value: T) => void) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = choices.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    const choice = choices[next];
    if (!choice) return;
    refs.current[next]?.focus();
    if (choice.value !== value) onChange(choice.value);
  };
  const tabStop = Math.max(0, choices.findIndex((c) => c.value === value));
  return { refs, onKeyDown, tabStop };
}

interface RadioFieldProps<T extends string | number> {
  label: string;
  choices: readonly Choice<T>[];
  // null: none chosen (the theme's default applies).
  value: T | null;
  onChange: (value: T) => CommandError | null;
  blockId: string | null;
  field: string;
  hint?: ReactNode;
  scope?: ReactNode;
  // seg: a segmented row (.seg); swatches: colour circles; steps: tiles.
  look?: "seg" | "seg-icons" | "swatches" | "steps" | "choices";
  rules?: FieldRules;
}

export function RadioField<T extends string | number>({ label, choices, value, onChange, blockId, field, hint, scope, look = "seg", rules }: RadioFieldProps<T>) {
  const id = useId();
  const [refusal, setRefusal] = useState<string | null>(null);
  useClaim(field);
  const server = useServerErrors(blockId, field, rules);
  const errors = refusal ? [refusal, ...server] : server;
  const choose = (next: T) => {
    const error = onChange(next);
    setRefusal(error ? refusalAt(error, field, rules) : null);
  };
  const { refs, onKeyDown, tabStop } = useRadioKeys(choices, value, choose);
  const className = look === "seg" ? "seg seg-text" : look === "seg-icons" ? "seg seg-icons" : look;
  return (
    <FieldFrame id={id} label={label} labelFor={false} hint={hint} scope={scope} errors={errors}>
      <div className={className} role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy(id, hint, errors)} aria-invalid={errors.length > 0 ? true : undefined}>
        {choices.map((choice, index) => {
          const checked = choice.value === value;
          const iconOnly = choice.icon !== undefined && (look === "seg-icons");
          return (
            <button
              key={String(choice.value)}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={iconOnly || look === "swatches" || choice.content ? choice.label : undefined}
              title={choice.title ?? (iconOnly || look === "swatches" ? choice.label : undefined)}
              tabIndex={index === tabStop ? 0 : -1}
              className={look === "swatches" && choice.color === undefined ? "sw-none" : undefined}
              style={choice.color ? ({ "--c": choice.color } as CSSProperties) : undefined}
              onClick={() => {
                if (!checked) choose(choice.value);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {look === "swatches"
                ? checked && <span className="pick-check" aria-hidden="true"><Icon name="check" /></span>
                : choice.content ?? (
                  <>
                    {choice.icon && <Icon name={choice.icon} />}
                    {!iconOnly && choice.label}
                  </>
                )}
            </button>
          );
        })}
      </div>
    </FieldFrame>
  );
}

// ------------------------------------------------------------ ruler

interface RulerFieldProps {
  label: string;
  // The steps in order; labels as the ruler prints them.
  steps: ReadonlyArray<{ value: string; label: string; name: string }>;
  value: string | null;
  onChange: (value: string) => CommandError | null;
  blockId: string | null;
  field: string;
  hint?: ReactNode;
  scope?: ReactNode;
  // Said for no value: the theme's default applies.
  unsetText?: string;
}

// A spacing scale, None to XXL, as a slider: arrows step along it, a click
// takes the nearest step.
export function RulerField({ label, steps, value, onChange, blockId, field, hint, scope, unsetText = "Theme default" }: RulerFieldProps) {
  const id = useId();
  const [refusal, setRefusal] = useState<string | null>(null);
  useClaim(field);
  const server = useServerErrors(blockId, field);
  const errors = refusal ? [refusal, ...server] : server;
  const index = value === null ? -1 : steps.findIndex((s) => s.value === value);
  const gaps = steps.length - 1;
  const choose = (next: number) => {
    const step = steps[Math.min(gaps, Math.max(0, next))];
    if (!step || step.value === value) return;
    const error = onChange(step.value);
    setRefusal(error ? refusalAt(error, field) : null);
  };
  const current = index >= 0 ? steps[index] : undefined;
  return (
    <FieldFrame id={id} label={label} labelFor={false} hint={hint} scope={scope} errors={errors}>
      <div
        className={`ruler${steps.length > 7 ? " ruler-wide" : ""}`}
        role="slider"
        tabIndex={0}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy(id, hint, errors)}
        aria-invalid={errors.length > 0 ? true : undefined}
        aria-valuemin={0}
        aria-valuemax={gaps}
        aria-valuenow={index >= 0 ? index : undefined}
        aria-valuetext={current ? current.name : unsetText}
        style={{ "--steps": gaps, "--v": Math.max(index, 0) } as CSSProperties}
        onKeyDown={(event) => {
          const from = index < 0 ? -1 : index;
          let next: number | null = null;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") next = from + 1;
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, from - 1);
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = gaps;
          if (next === null) return;
          event.preventDefault();
          choose(next);
        }}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const inner = box.width - 36;
          if (inner <= 0) return;
          choose(Math.round(((event.clientX - box.left - 18) / inner) * gaps));
        }}
      >
        <span className="ruler-ticks" aria-hidden="true">
          {steps.map((step, i) => <i key={step.value} style={{ "--t": gaps === 0 ? 0 : i / gaps } as CSSProperties} />)}
        </span>
        {index >= 0 && <span className="ruler-thumb" aria-hidden="true" />}
        <span className="ruler-nums" aria-hidden="true">
          {steps.map((step, i) => <b key={step.value} className={i === index ? "on" : undefined}>{step.label}</b>)}
        </span>
      </div>
    </FieldFrame>
  );
}

// The server's errors at fields a panel draws without a control of their
// own (an image's source, under its picture).
export function ServerErrors({ blockId, fields, rules }: { blockId: string | null; fields: readonly string[]; rules?: FieldRules }) {
  const id = useId();
  const all = useUi((u) => u.serverErrors);
  const claims = useContext(ClaimsContext);
  const key = fields.join(" ");
  useEffect(() => {
    if (!claims) return undefined;
    const releases = key.split(" ").map((field) => claims.claim(field));
    return () => releases.forEach((release) => release());
  }, [claims, key]);
  const errors = useMemo(() => fields.flatMap((field) => serverErrorsAt(all, blockId, field, rules)), [all, blockId, fields, rules]);
  return <ErrorList id={id} errors={errors} />;
}

// ----------------------------------------------------------- switches

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => CommandError | null;
  blockId: string | null;
  field: string;
  describedById?: string;
}

export function Toggle({ label, checked, onChange, blockId, field, describedById }: ToggleProps) {
  const [refusal, setRefusal] = useState<string | null>(null);
  useClaim(field);
  const server = useServerErrors(blockId, field);
  const errors = refusal ? [refusal, ...server] : server;
  const id = useId();
  return (
    <>
      <label className="toggle">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          aria-describedby={[describedById, errors.length > 0 ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}
          aria-invalid={errors.length > 0 ? true : undefined}
          onChange={(event) => {
            const error = onChange(event.target.checked);
            setRefusal(error ? refusalAt(error, field) : null);
          }}
        />
        <span className="toggle-ui" aria-hidden="true" />
        <span>{label}</span>
      </label>
      <ErrorList id={`${id}-error`} errors={errors} />
    </>
  );
}

// The server's sentence for a finding at a field, for controls of their own.
export { explain };
