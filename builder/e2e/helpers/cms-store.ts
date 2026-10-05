// What the run's CMS keeps in its own databases, read from outside as it
// is: the fragments Solid Cache holds, the jobs Solid Queue ran, and the
// answers visitors sent with the pages' forms. The harness makes those
// databases for the run (harness/servers.ts) and names their folder in
// E2E_CMS_FOLDER. Only read: the CMS is the one writing them, and a busy
// database is waited for, never written.
import { join } from "node:path";

const folder = (): string => {
  const path = process.env.E2E_CMS_FOLDER;
  if (!path) throw new Error("E2E_CMS_FOLDER is not set: the run's global setup starts the CMS and names its folder");
  return path;
};

type Database = import("node:sqlite").DatabaseSync;

let sqlite: Promise<typeof import("node:sqlite")> | undefined;

// node:sqlite says once that it is experimental (Node 22 and 24): that
// notice, and no other warning, is kept off the run's output.
function loadSqlite(): Promise<typeof import("node:sqlite")> {
  if (!sqlite) {
    const shown = process.listeners("warning");
    process.removeAllListeners("warning");
    process.on("warning", (warning) => {
      if (warning.name === "ExperimentalWarning" && /SQLite/.test(warning.message)) return;
      for (const listener of shown) listener(warning);
    });
    sqlite = import("node:sqlite");
  }
  return sqlite;
}

async function read<T>(file: string, query: (db: Database) => T): Promise<T> {
  const { DatabaseSync } = await loadSqlite();
  const db = new DatabaseSync(join(folder(), file), { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 10000");
    return query(db);
  } finally {
    db.close();
  }
}

// The fragments of pages Solid Cache holds (their keys start with Rails'
// "views/"): a page's whole HTML, and each of its blocks.
export const fragments = (): Promise<number> => read("e2e_cache.sqlite3", (db) =>
  Number((db.prepare("SELECT COUNT(*) AS n FROM solid_cache_entries WHERE instr(CAST(key AS TEXT), 'views/') > 0").get() as { n: number }).n));

// The answers kept for a page's forms, oldest first, as the CMS stores
// them: the form, the published version it was read from, and the
// answers and the copy of the fields, as JSON.
export interface KeptAnswer {
  formId: string;
  pageVersionId: number;
  answers: Record<string, string | boolean>;
  fields: Array<{ name: string; kind: string; label: string; required: boolean; maxLength?: number }>;
}

export const keptAnswers = (pageId: number): Promise<KeptAnswer[]> => read("e2e.sqlite3", (db) =>
  (db.prepare("SELECT form_id AS formId, page_version_id AS pageVersionId, answers, fields FROM submissions WHERE page_id = ? ORDER BY id").all(pageId) as unknown as Array<{ formId: string; pageVersionId: number; answers: string; fields: string }>)
    .map((row) => ({ ...row, answers: JSON.parse(row.answers), fields: JSON.parse(row.fields) })));

export interface Job {
  scheduledAt: string | null;
  finishedAt: string | null;
}

// The PublishPageJob of a schedule, as Solid Queue keeps it: when it was
// set for, and when it ran (Solid Queue keeps the finished ones a day).
export const publishJob = (scheduleId: number): Promise<Job[]> => read("e2e_queue.sqlite3", (db) =>
  (db.prepare("SELECT scheduled_at AS scheduledAt, finished_at AS finishedAt FROM solid_queue_jobs WHERE class_name = 'PublishPageJob' AND arguments LIKE ? ORDER BY id")
    .all(`%"arguments":[${scheduleId}]%`) as unknown as Job[]));
