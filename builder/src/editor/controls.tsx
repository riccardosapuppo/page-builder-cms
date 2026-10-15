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
import { numberText, typedNumber } from "../shared/free-type.ts";
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
// keys), as sentences. With no blockId, a value that is not the page's (an
// entry's, ./collections/), none: its form gives its own (`issues`).
export function useServerErrors(blockId: string | null | undefined, field: string | undefined, rules?: FieldRules): string[] {
  const errors = useUi((u) => u.serverErrors);
  return useMemo(
    () => (blockId === undefined || field === undefined ? [] : serverErrorsAt(errors, blockId, field, rules)),
    [errors, blockId, field, rules],
  );
}

// A field's errors with those its form found itself, each said once.
function useWithIssues(server: string[], issues: readonly string[] | undefined): string[] {
  // By their words, so a list made again with the same ones changes nothing.
  const key = issues && issues.length > 0 ? JSON.stringify(issues) : "";
  return useMemo(() => (key === "" ? server : [...server, ...(JSON.parse(key) as string[]).filter((issue) => !server.includes(issue))]), [server, key]);
}

// ------------------------------------------------------- field frame

// What a setting's value is to the device previewed, beside its label
// (design/shots/style.png): "From desktop", "Tablet only", "Theme
// default", or a Reset button.
export interface ScopeProps {
  scope?: ReactNode;
  // The scope names the device's own value: drawn darker, with its glyph.
  scopeDevice?: boolean | undefined;
  // What a pointer resting on the scope is told.
  scopeTitle?: string | undefined;
  // Under the control, while a tablet or a phone is previewed.
  note?: FieldNote | undefined;
}

// What a change does on the device previewed ("then": "A change here
// applies to tablets only."), or the device's own value with its way back
// ("override"). Its words describe the control to a screen reader.
export interface FieldNote {
  kind: "then" | "override";
  icon: IconName;
  text: ReactNode;
  // A button after the words: the override's Remove.
  action?: ReactNode;
}

interface FieldFrameProps extends ScopeProps {
  id: string;
  label: ReactNode;
  // A label element for a native input; a span named by aria-labelledby
  // for a group.
  labelFor?: boolean;
  hint?: ReactNode;
  errors: readonly string[];
  children: ReactNode;
  className?: string;
}

export function FieldFrame({ id, label, labelFor = true, scope, scopeDevice, scopeTitle, note, hint, errors, children, className }: FieldFrameProps) {
  const labelElement = labelFor
    ? <label className="label" htmlFor={id} id={`${id}-label`}>{label}</label>
    : <span className="label" id={`${id}-label`}>{label}</span>;
  const scopeElement = scope ? <span className={`scope${scopeDevice ? " scope-device" : ""}`} title={scopeTitle}>{scope}</span> : null;
  return (
    <div className={`field${errors.length > 0 ? " field-error" : ""}${className ? ` ${className}` : ""}`}>
      {scopeElement ? <div className="label-row">{labelElement}{scopeElement}</div> : labelElement}
      {children}
      {note && <NoteView id={`${id}-note`} note={note} />}
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      <ErrorList id={`${id}-error`} errors={errors} />
    </div>
  );
}

function NoteView({ id, note }: { id: string; note: FieldNote }) {
  if (note.kind === "then") return <p className="scope-then" id={id}><Icon name={note.icon} /><span>{note.text}</span></p>;
  return (
    <div className="override">
      <Icon name={note.icon} />
      <p id={id}>{note.text}</p>
      {note.action}
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

export function describedBy(id: string, hint: unknown, errors: readonly string[], note?: unknown): string | undefined {
  const ids = [note ? `${id}-note` : null, hint ? `${id}-hint` : null, errors.length > 0 ? `${id}-error` : null].filter((x): x is string => x !== null);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

// ---------------------------------------------------------- text

interface TypedOptions {
  label: string;
  value: string;
  onCommit: (value: string) => CommandError | null;
  blockId: string | null | undefined;
  field: string;
  rules?: FieldRules | undefined;
  issues?: readonly string[] | undefined;
}

// What a field typed into does with its text (TextField's, and the size
// field's number): the text as typed, handed over when the person pauses
// (on the injected clock), leaves the field or presses Enter, and held
// with the page's other pending edits until then (./pending.ts); the
// refusal, if any, with the server's errors at the field.
function useTyped({ label, value, onCommit, blockId, field, rules, issues }: TypedOptions) {
  const { clock, ui } = useEnv();
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [refusal, setRefusal] = useState<string | null>(null);
  const timer = useRef<unknown>(null);
  // While text waits for its pause, the editor's other commands hand it
  // over first (./pending.ts): this lets go of that hold.
  const release = useRef<(() => void) | null>(null);
  const focused = useRef(false);
  // The next value is the field's own making (a size's unit chosen beside
  // it): shown in the box even while the person is in it.
  const following = useRef(false);
  const sent = useRef(value);
  // What a commit hands over when it runs later (a timer, a blur, the panel
  // going away): this render's text and handler, not the first one's.
  const latest = useRef({ draft, onCommit, rules, field, label });
  useLayoutEffect(() => {
    latest.current = { draft, onCommit, rules, field, label };
  });
  useClaim(field);
  const server = useWithIssues(useServerErrors(blockId, field, rules), issues);

  // Hands the text over: true once the page has it (or nothing waits),
  // false when the page refused it. A refused text stays in the field,
  // which holds it again (./pending.ts), so what asks for it waits; asked
  // by something else (a command, Publish, another page), the field says
  // why in the notice too, since it may be out of sight.
  const commit = useCallback(function commit(asked = false): boolean {
    if (timer.current !== null) {
      clock.clearTimeout(timer.current);
      timer.current = null;
    }
    release.current?.();
    release.current = null;
    const { draft: text, onCommit: hand, rules: r, field: f, label: name } = latest.current;
    // The text the page has (a refused one typed back as it was): nothing
    // to hand over, and nothing refused any more.
    if (text === sent.current) {
      setRefusal(null);
      return true;
    }
    const error = hand(text);
    // A text that is the page's own once its caller has made it so (a link
    // trimmed to the one kept: "That would change nothing") is handed over
    // as much as one the page took.
    if (!error || error.reason === "nothing") {
      sent.current = text;
      setRefusal(null);
      return true;
    }
    const why = refusalAt(error, f, r);
    setRefusal(why);
    release.current = ui.getState().pending.hold(() => commit(true));
    if (asked) ui.getState().say(`${name} cannot be kept yet: ${why.replace(/\.$/, "")}. It stays in its field until the page can take it.`);
    return false;
  }, [clock, ui]);

  // The page changed under the field (another field, a reload): show it,
  // unless the person is typing here. A refused text it replaces is let go.
  // A commit reads the page's text from now on, not the one drawn before:
  // the field may be left before it is drawn again (the Tab key passing
  // through it on a busy machine), and would hand that one back as typed.
  useEffect(() => {
    if (!following.current && (focused.current || timer.current !== null)) return;
    following.current = false;
    latest.current = { ...latest.current, draft: value };
    setDraft(value);
    sent.current = value;
    setRefusal(null);
    release.current?.();
    release.current = null;
  }, [value]);

  // Text still waiting when the panel goes (another block selected) is
  // handed over, not lost; a refused one goes with the field, so nothing
  // is left holding the page's commands.
  useEffect(() => () => {
    if (timer.current !== null) commit();
    release.current?.();
    release.current = null;
  }, [commit]);

  // A new text, typed or stepped by the arrows: kept after the pause.
  const change = (text: string) => {
    // The text handed over by a command elsewhere is this render's, so
    // the latest is set at once, not after the next render.
    latest.current = { ...latest.current, draft: text };
    setDraft(text);
    if (timer.current !== null) clock.clearTimeout(timer.current);
    release.current ??= ui.getState().pending.hold(() => commit(true));
    timer.current = clock.setTimeout(() => {
      timer.current = null;
      commit();
    }, COMMIT_AFTER_MS);
  };

  const errors = refusal ? [refusal, ...server.filter((m) => m !== refusal)] : server;
  return {
    id,
    draft,
    latest,
    errors,
    commit,
    change,
    // A refusal of the field's own, said there (the size's unit), or none.
    refuse: setRefusal,
    // Whether the next value is the field's own making, to show at once.
    follow: (on: boolean) => {
      following.current = on;
    },
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit();
    },
  };
}

interface TextFieldProps extends ScopeProps {
  label: string;
  value: string;
  // Hands the text over; null when the page took it, the refusal otherwise.
  onCommit: (value: string) => CommandError | null;
  // Where the value is: the block (null for the page itself) and the
  // field's pointer inside it ("/props/text"), for the errors. No block for
  // a value that is not the page's (an entry's), whose form gives its
  // errors in `issues`.
  blockId?: string | null;
  field: string;
  rules?: FieldRules;
  // Errors found by the form the field is in, said under it after its own.
  issues?: readonly string[];
  // Said beside the label, and to a screen reader.
  required?: boolean;
  multiline?: boolean;
  // A text area for a value of one line (a heading's text): Enter hands
  // the text over instead of starting a new line.
  oneLine?: boolean;
  rows?: number;
  placeholder?: string | undefined;
  hint?: ReactNode;
  icon?: IconName;
  prefix?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  // Values to choose from as the person types (a one-line field): the
  // browser's own list, each value with its name (a page's address, its
  // title). Anything else can still be typed.
  suggestions?: ReadonlyArray<{ value: string; label: string }>;
  // A unit after the text, in its box ("em"), which describes the field.
  suffix?: string | undefined;
  // The keyboard a touch screen offers for it ("decimal").
  inputMode?: "decimal" | "text";
  // What the up and down arrows make of the text (Shift: a bigger step),
  // or null to leave it: a number they step.
  stepBy?: (draft: string, by: 1 | -1, big: boolean) => string | null;
}

export function TextField({ label, value, onCommit, blockId, field, rules, issues, required = false, multiline = false, oneLine = false, rows = 2, placeholder, hint, icon, prefix, autoFocus, disabled, suggestions, suffix, inputMode, stepBy, scope, scopeDevice, scopeTitle, note }: TextFieldProps) {
  const typed = useTyped({ label, value, onCommit, blockId, field, rules, issues });
  const { id, draft, errors, commit } = typed;
  const unitId = suffix ? `${id}-unit` : null;
  const common = {
    id,
    value: draft,
    placeholder,
    autoFocus,
    disabled,
    inputMode,
    "aria-required": required ? true : undefined,
    "aria-invalid": errors.length > 0 ? true : undefined,
    "aria-describedby": [unitId, describedBy(id, hint, errors, note)].filter(Boolean).join(" ") || undefined,
    onFocus: typed.onFocus,
    onBlur: typed.onBlur,
    onChange: (event: { target: { value: string } }) => typed.change(event.target.value),
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
        className={icon || prefix || suffix ? undefined : "input"}
        spellCheck={rules?.kind === "href" || rules?.kind === "anchor" || rules?.kind === "classes" || rules?.kind === "slug" ? false : undefined}
        list={suggestions && suggestions.length > 0 ? `${id}-list` : undefined}
        {...common}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          else if (stepBy && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            const next = stepBy(typed.latest.current.draft, event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
            if (next === null) return;
            event.preventDefault();
            typed.change(next);
          }
        }}
      />
    );
    const listed = suggestions && suggestions.length > 0
      ? <datalist id={`${id}-list`}>{suggestions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</datalist>
      : null;
    control = icon || prefix || suffix
      ? <div className="input input-icon">{icon && <Icon name={icon} />}{prefix && <span className="input-prefix" aria-hidden="true">{prefix}</span>}{input}{suffix && <span className="input-suffix" id={unitId ?? undefined}>{suffix}</span>}{listed}</div>
      : <>{input}{listed}</>;
  }
  return <FieldFrame id={id} label={required ? <>{label} <span className="req">required</span></> : label} hint={hint} scope={scope} scopeDevice={scopeDevice} scopeTitle={scopeTitle} note={note} errors={errors}>{control}</FieldFrame>;
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

// A number with two decimals at most, from what is typed: a decimal point
// or a comma, no third decimal. What the arrows step from: the number
// typed, else the one in use (the placeholder).
const TWO_DECIMALS = "Write a number, with two decimals at most.";

function stepNumber(draft: string, placeholder: string | undefined, by: 1 | -1, big: boolean, step: number, min: number, max: number): string | null {
  const from = draft.trim() !== "" ? typedNumber(draft) : placeholder !== undefined && placeholder !== "" ? Number(placeholder) : null;
  if (from === null || !Number.isFinite(from)) return null;
  // A number between two hundredths (the theme's -0.015) goes to the one
  // on the arrow's side first: up from -0.015 is -0.01, down -0.02.
  const start = (by > 0 ? Math.floor(from * 100 + 1e-9) : Math.ceil(from * 100 - 1e-9)) / 100;
  const next = Math.round((start + by * step * (big ? 10 : 1)) * 100) / 100;
  return numberText(Math.min(max, Math.max(min, next)));
}

// A number with its unit (letter spacing in em, a line height, a letter
// width in %), typed: handed over as text is, when the person pauses,
// leaves the field or presses Enter, so a number typed is one change. The
// arrows step it, by `step` (Shift: ten steps), within min and max.
// Empty, the field shows the value in use as its placeholder; emptied, it
// hands over null, which takes the value away.
interface MeasureFieldProps extends ScopeProps {
  label: string;
  // The number as the page writes it ("-0.02"), or null for none.
  value: string | null;
  placeholder?: string | undefined;
  unit?: string | undefined;
  step: number;
  min: number;
  max: number;
  onCommit: (value: number | null) => CommandError | null;
  blockId: string | null;
  field: string;
  hint?: ReactNode;
}

export function MeasureField({ value, placeholder, unit, step, min, max, onCommit, ...rest }: MeasureFieldProps) {
  return (
    <TextField
      {...rest}
      rules={{ kind: "number", minimum: min, maximum: max }}
      value={value ?? ""}
      placeholder={placeholder}
      suffix={unit}
      inputMode="decimal"
      stepBy={(draft, by, big) => stepNumber(draft, placeholder, by, big, step, min, max)}
      onCommit={(text) => {
        if (text.trim() === "") return onCommit(null);
        const number = typedNumber(text);
        return number === null ? { reason: "invalid", message: TWO_DECIMALS } : onCommit(number);
      }}
    />
  );
}

// A size: its number, typed as a measure is, and its unit, chosen beside
// it. The number keeps the unit chosen; a unit chosen hands over the size
// in that unit (onUnit: the panel converts it, from the number in the box,
// kept first if it waits, else from the one in use), one change. Both are
// one field: one label, one place for what is refused.
interface SizeFieldProps extends ScopeProps {
  label: string;
  // The size's number as the page writes it ("6"), or null for none.
  value: string | null;
  // The unit of the size, or the one in use with none.
  unit: string;
  units: ReadonlyArray<{ value: string; label: string; title: string }>;
  placeholder?: string | undefined;
  step: number;
  min: number;
  max: number;
  onCommit: (value: number | null) => CommandError | null;
  // The unit chosen, and the number in the box (null: none, the one in use).
  onUnit: (unit: string, from: number | null) => CommandError | null;
  blockId: string | null;
  field: string;
  hint?: ReactNode;
}

export function SizeField({ label, value, unit, units, placeholder, step, min, max, onCommit, onUnit, blockId, field, hint, scope, scopeDevice, scopeTitle, note }: SizeFieldProps) {
  const typed = useTyped({
    label,
    value: value ?? "",
    blockId,
    field,
    rules: { kind: "number" },
    onCommit: (text) => {
      if (text.trim() === "") return onCommit(null);
      const number = typedNumber(text);
      return number === null ? { reason: "invalid", message: TWO_DECIMALS } : onCommit(number);
    },
  });
  const { id, draft, errors, commit } = typed;
  const choose = (next: string) => {
    // What waits in the box is kept first, in the unit it was typed in,
    // and converted from: this drawing's own handler knows the size before.
    if (!commit()) return;
    typed.follow(true);
    const error = onUnit(next, typedNumber(typed.latest.current.draft));
    const refused = error !== null && error.reason !== "nothing";
    if (refused) typed.follow(false);
    typed.refuse(refused ? refusalAt(error, field) : null);
  };
  const described = describedBy(id, hint, errors, note);
  return (
    <FieldFrame id={id} label={label} hint={hint} scope={scope} scopeDevice={scopeDevice} scopeTitle={scopeTitle} note={note} errors={errors}>
      <div className="measure">
        <input
          type="text"
          className="input"
          id={id}
          value={draft}
          placeholder={placeholder}
          inputMode="decimal"
          aria-invalid={errors.length > 0 ? true : undefined}
          aria-describedby={[`${id}-units`, described].filter(Boolean).join(" ")}
          onFocus={typed.onFocus}
          onBlur={typed.onBlur}
          onChange={(event) => typed.change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              const next = stepNumber(typed.latest.current.draft, placeholder, event.key === "ArrowUp" ? 1 : -1, event.shiftKey, step, min, max);
              if (next === null) return;
              event.preventDefault();
              typed.change(next);
            }
          }}
        />
        <span className="visually-hidden" id={`${id}-units`}>{units.find((u) => u.value === unit)?.title ?? unit}</span>
        <RadioGroup choices={units} value={unit} choose={choose} look="seg" label={`${label}: unit`} describedBy={described} invalid={errors.length > 0} />
      </div>
    </FieldFrame>
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
  // In place of the swatch's own class (sw-none when it has no colour).
  className?: string;
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

type RadioLook = "seg" | "seg-icons" | "swatches" | "steps" | "choices";

interface RadioGroupProps<T extends string | number> {
  choices: readonly Choice<T>[];
  // The value set, or null when none is (the theme's default applies).
  value: T | null;
  // The value in use when none is set (the theme's, or the desktop's on a
  // device): checked as the design draws it, and choosing it again sets
  // nothing.
  inUse?: T | null | undefined;
  choose: (value: T) => void;
  look: RadioLook;
  // What names the group: the id of its label, or its own words.
  labelledBy?: string;
  label?: string;
  describedBy?: string | undefined;
  invalid: boolean;
  required?: boolean;
}

// One radio group, its keys a native group's: the arrows move the choice.
function RadioGroup<T extends string | number>({ choices, value, inUse = null, choose, look, labelledBy, label, describedBy: described, invalid, required = false }: RadioGroupProps<T>) {
  const shown = value ?? inUse;
  const { refs, onKeyDown, tabStop } = useRadioKeys(choices, shown, choose);
  const className = look === "seg" ? "seg seg-text" : look === "seg-icons" ? "seg seg-icons" : look;
  return (
    <div className={className} role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy === undefined ? label : undefined} aria-describedby={described} aria-invalid={invalid ? true : undefined} aria-required={required ? true : undefined}>
      {choices.map((choice, index) => {
        const checked = choice.value === shown;
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
            className={choice.className ?? (look === "swatches" && choice.color === undefined ? "sw-none" : undefined)}
            style={choice.color ? ({ "--c": choice.color } as CSSProperties) : undefined}
            onClick={() => {
              if (!checked) choose(choice.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {look === "swatches"
              ? null
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
  );
}

// A choice made, and what the page or the server said of it, for a field;
// with what the field's own form found (`issues`).
function useChoice<T extends string | number>(onChange: (value: T) => CommandError | null, blockId: string | null | undefined, field: string, rules: FieldRules | undefined, issues?: readonly string[]) {
  const [refusal, setRefusal] = useState<string | null>(null);
  useClaim(field);
  const server = useWithIssues(useServerErrors(blockId, field, rules), issues);
  const errors = refusal ? [refusal, ...server] : server;
  const choose = (next: T) => {
    const error = onChange(next);
    setRefusal(error ? refusalAt(error, field, rules) : null);
  };
  return { errors, choose };
}

interface RadioFieldProps<T extends string | number> extends ScopeProps {
  label: string;
  choices: readonly Choice<T>[];
  // null: none chosen (the theme's default applies).
  value: T | null;
  // The value in use when none is set, checked in its place.
  inUse?: T | null | undefined;
  onChange: (value: T) => CommandError | null;
  // As a text field's: no block for a value that is not the page's, whose
  // form gives its errors in `issues`.
  blockId?: string | null;
  field: string;
  issues?: readonly string[];
  required?: boolean;
  hint?: ReactNode;
  // seg: a segmented row (.seg); swatches: colour circles; steps: tiles.
  look?: RadioLook;
  rules?: FieldRules;
  // Said small above the choices (a colour's "Site colours").
  lead?: string;
  // Drawn under the choices, in the field, before its notes and errors (a
  // colour's palette and picker).
  extra?: ReactNode;
}

export function RadioField<T extends string | number>({ label, choices, value, inUse, onChange, blockId, field, issues, required = false, hint, scope, scopeDevice, scopeTitle, note, look = "seg", rules, lead, extra }: RadioFieldProps<T>) {
  const id = useId();
  const { errors, choose } = useChoice(onChange, blockId, field, rules, issues);
  return (
    <FieldFrame id={id} label={required ? <>{label} <span className="req">required</span></> : label} labelFor={false} hint={hint} scope={scope} scopeDevice={scopeDevice} scopeTitle={scopeTitle} note={note} errors={errors}>
      {lead && <p className="field-lead">{lead}</p>}
      <RadioGroup choices={choices} value={value} inUse={inUse} choose={choose} look={look} labelledBy={`${id}-label`} describedBy={describedBy(id, hint, errors, note)} invalid={errors.length > 0} required={required} />
      {extra}
    </FieldFrame>
  );
}

// Two settings under one label, side by side, each its own group with its
// own name (the design's Alignment: vertical, then horizontal). Where the
// two say the same of their values (both the theme's, both the
// desktop's), that is said once, beside the label; otherwise each says its
// own beside its name, and its note under the pair. The pair stays one
// field either way, so a choice made in it keeps the focus where it is.
export interface PairPart<T extends string | number> extends ScopeProps {
  label: string;
  choices: readonly Choice<T>[];
  value: T | null;
  inUse?: T | null | undefined;
  onChange: (value: T) => CommandError | null;
  field: string;
  look: RadioLook;
}

export function RadioPairField<T extends string | number>({ label, parts, blockId, hint }: { label: string; parts: readonly [PairPart<T>, PairPart<T>]; blockId: string | null; hint?: ReactNode }) {
  const id = useId();
  const first = useChoice(parts[0].onChange, blockId, parts[0].field, undefined);
  const second = useChoice(parts[1].onChange, blockId, parts[1].field, undefined);
  const errors = [...first.errors, ...second.errors];
  const [a, b] = parts;
  const shared = typeof a.scope === "string" && a.scope === b.scope;
  const scoping: ScopeProps = shared ? { scope: a.scope, scopeTitle: a.scopeTitle, note: a.note } : {};
  return (
    <FieldFrame id={id} label={label} labelFor={false} hint={hint} {...scoping} errors={errors}>
      <div className="pair">
        {parts.map((part, index) => {
          const own = index === 0 ? first : second;
          const noteId = shared ? (a.note ? `${id}-note` : null) : (part.note ? `${id}-${index}-note` : null);
          const described = [noteId, hint ? `${id}-hint` : null, own.errors.length > 0 ? `${id}-error` : null].filter((x): x is string => x !== null).join(" ");
          return (
            <div key={part.field}>
              <div className="label-row">
                <span className="label" id={`${id}-${index}-label`}>{part.label}</span>
                {!shared && part.scope && <span className={`scope${part.scopeDevice ? " scope-device" : ""}`} title={part.scopeTitle}>{part.scope}</span>}
              </div>
              <RadioGroup choices={part.choices} value={part.value} inUse={part.inUse} choose={own.choose} look={part.look} labelledBy={`${id}-${index}-label`} describedBy={described === "" ? undefined : described} invalid={own.errors.length > 0} />
            </div>
          );
        })}
      </div>
      {!shared && parts.map((part, index) => part.note && <NoteView key={part.field} id={`${id}-${index}-note`} note={part.note} />)}
    </FieldFrame>
  );
}

// ------------------------------------------------------------ ruler

interface RulerFieldProps extends ScopeProps {
  label: string;
  // The steps in order; labels as the ruler prints them.
  steps: ReadonlyArray<{ value: string; label: string; name: string }>;
  value: string | null;
  onChange: (value: string) => CommandError | null;
  blockId: string | null;
  field: string;
  hint?: ReactNode;
  // Said for no value: the theme's default applies.
  unsetText?: string;
  // The theme's own step where none is set, when the theme has one on
  // every width: drawn where the value would be, and said as the theme's.
  theme?: string | null;
  // The desktop's step, marked with a ring, while a device's own value
  // is shown (design/shots/style.png).
  ring?: string | null;
  // What the theme's step is said as ("the theme’s default"; a weight's
  // "the preset’s").
  themeWords?: string;
}

// A spacing scale, None to XXL, as a slider: arrows step along it, a click
// takes the nearest step.
export function RulerField({ label, steps, value, onChange, blockId, field, hint, scope, scopeDevice, scopeTitle, note, theme = null, ring = null, unsetText = "Theme default", themeWords = "the theme’s default" }: RulerFieldProps) {
  const id = useId();
  const [refusal, setRefusal] = useState<string | null>(null);
  useClaim(field);
  const server = useServerErrors(blockId, field);
  const errors = refusal ? [refusal, ...server] : server;
  const set = value === null ? -1 : steps.findIndex((s) => s.value === value);
  const themeAt = value === null && theme !== null ? steps.findIndex((s) => s.value === theme) : -1;
  // Where the thumb stands: the value, else the theme's step.
  const index = set >= 0 ? set : themeAt;
  const gaps = steps.length - 1;
  const choose = (next: number) => {
    const step = steps[Math.min(gaps, Math.max(0, next))];
    if (!step || step.value === value) return;
    const error = onChange(step.value);
    setRefusal(error ? refusalAt(error, field) : null);
  };
  const current = index >= 0 ? steps[index] : undefined;
  const valueText = !current ? unsetText : set >= 0 ? current.name : `${current.name}, ${themeWords}`;
  const ringAt = ring === null ? -1 : steps.findIndex((s) => s.value === ring);
  // More than seven steps print their names smaller; names of one word
  // each (a weight's 100 to 900) never take a second line.
  const wide = steps.length > 7;
  const oneLine = wide && steps.every((s) => !s.label.includes(" "));
  return (
    <FieldFrame id={id} label={label} labelFor={false} hint={hint} scope={scope} scopeDevice={scopeDevice} scopeTitle={scopeTitle} note={note} errors={errors}>
      <div
        className={`ruler${wide ? " ruler-wide" : ""}${oneLine ? " ruler-one-line" : ""}`}
        role="slider"
        tabIndex={0}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy(id, hint, errors, note)}
        aria-invalid={errors.length > 0 ? true : undefined}
        aria-valuemin={0}
        aria-valuemax={gaps}
        aria-valuenow={index >= 0 ? index : undefined}
        aria-valuetext={valueText}
        style={{ "--steps": gaps, "--v": Math.max(index, 0), ...(ringAt >= 0 ? { "--inherit": ringAt } : {}) } as CSSProperties}
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
        {ringAt >= 0 && <span className="ruler-ghost" aria-hidden="true" data-step={steps[ringAt]!.value} />}
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
  // As a text field's: no block for a value that is not the page's, whose
  // form gives its errors in `issues`.
  blockId?: string | null;
  field: string;
  issues?: readonly string[];
  describedById?: string;
}

export function Toggle({ label, checked, onChange, blockId, field, issues, describedById }: ToggleProps) {
  const [refusal, setRefusal] = useState<string | null>(null);
  useClaim(field);
  const server = useWithIssues(useServerErrors(blockId, field), issues);
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
