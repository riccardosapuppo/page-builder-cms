// A plan as it streams in (./plan.ts): a model's answer arrives a few
// characters at a time, and each section is handed on as soon as its last
// character has come, so the page grows on the canvas while the model is
// still writing. The page's title and description, the plan's first two
// keys, are handed on the same way.
//
// It reads JSON's structure and nothing more: where strings start and end
// (escapes included), and how deep the objects and arrays go. A section is
// the text of one element of the top-level object's "sections" array,
// parsed once it closes; its own arrays and objects (columns, blocks) only
// change the depth. The whole answer is parsed at the end, so an answer
// that is not JSON, or stops halfway, is said there.
export interface PlanEvents {
  head(key: "title" | "description", value: string): void;
  section(value: unknown, index: number): void;
}

export class PlanStream {
  private text = "";
  private scanned = 0;
  private readonly open: string[] = [];
  private inString = false;
  private escaped = false;
  private stringStart = -1;
  // The top-level object's key being read, and the last string seen at its depth.
  private key: string | null = null;
  private topString: string | null = null;
  private inSections = false;
  private elementStart = -1;
  private sections = 0;

  private readonly events: PlanEvents;

  constructor(events: PlanEvents) {
    this.events = events;
  }

  push(chunk: string): void {
    this.text += chunk;
    for (; this.scanned < this.text.length; this.scanned += 1) this.read(this.text[this.scanned]!, this.scanned);
  }

  // The whole answer, parsed; throws when it is not one JSON value.
  end(): unknown {
    return JSON.parse(this.text);
  }

  private read(c: string, at: number): void {
    if (this.inString) {
      if (this.escaped) this.escaped = false;
      else if (c === "\\") this.escaped = true;
      else if (c === "\"") {
        this.inString = false;
        if (this.open.length === 1) this.topValue(JSON.parse(this.text.slice(this.stringStart, at + 1)) as string);
      }
      return;
    }
    switch (c) {
      case "\"":
        this.inString = true;
        this.stringStart = at;
        return;
      case "{":
      case "[":
        this.open.push(c);
        if (this.open.length === 2 && c === "[" && this.key === "sections") this.inSections = true;
        if (this.open.length === 3 && c === "{" && this.inSections) this.elementStart = at;
        return;
      case "}":
      case "]":
        if (this.open.length === 3 && c === "}" && this.inSections && this.elementStart >= 0) {
          const section: unknown = JSON.parse(this.text.slice(this.elementStart, at + 1));
          this.elementStart = -1;
          this.events.section(section, this.sections++);
        }
        this.open.pop();
        if (this.open.length === 1 && c === "]") this.inSections = false;
        return;
      case ":":
        if (this.open.length === 1) this.key = this.topString;
        return;
      case ",":
        if (this.open.length === 1) {
          this.key = null;
          this.topString = null;
        }
        return;
      default:
    }
  }

  // A string at the top-level object's depth: a key, or the value of one.
  private topValue(value: string): void {
    if (this.key === null) {
      this.topString = value;
      return;
    }
    if (this.key === "title" || this.key === "description") this.events.head(this.key, value);
  }
}
