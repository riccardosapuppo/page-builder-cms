// node --test tools/lib/processes.test.ts
//
// The three readers of "who listens on this port", fed text in the shape
// each system prints, on any system: the ss and lsof readers are what
// Linux and macOS take, and this is where they run on Windows too. The
// samples follow the formats of netstat -a -n -o (Windows 11), ss -H -l -t
// -n -p (iproute2) and lsof -F pn, with the lines a reader must skip next
// to the ones it must find. The same for the readers of a process's name:
// tasklist's, ps's, and the one of Linux's /proc, given a /proc of its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromLsof, fromNetstat, fromProc, fromPs, fromSs, fromTasklist, processName, type ProcFiles } from "./processes.ts";

const NETSTAT = [
  "",
  "Connessioni attive",
  "",
  "  Proto  Indirizzo locale       Indirizzo esterno      Stato           PID",
  "  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1180",
  "  TCP    127.0.0.1:3902         0.0.0.0:0              LISTENING       896",
  "  TCP    127.0.0.1:3902         127.0.0.1:51544        ESTABLISHED     896",
  "  TCP    127.0.0.1:51544        127.0.0.1:3902         ESTABLISHED     4100",
  "  TCP    127.0.0.1:39020        0.0.0.0:0              LISTENING       77",
  "  TCP    [::1]:3902             [::]:0                 LISTENING       896",
  "  UDP    127.0.0.1:3902         *:*                                    55",
].join("\r\n");

const SS = [
  "LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*    users:((\"systemd-resolve\",pid=512,fd=14))",
  "LISTEN 0      1024       127.0.0.1:3902       0.0.0.0:*    users:((\"ruby\",pid=4242,fd=7))",
  "LISTEN 0      1024       127.0.0.1:39020      0.0.0.0:*    users:((\"ruby\",pid=77,fd=7))",
  "LISTEN 0      511                *:3902             *:*    users:((\"puma 8.0.2 (tcp\",pid=4300,fd=9),(\"ruby\",pid=4301,fd=9))",
  "LISTEN 0      1024           [::1]:3902          [::]:*",
  "LISTEN 0      4096         0.0.0.0:22         0.0.0.0:*",
  "",
].join("\n");

const LSOF = ["p4242", "f7", "n127.0.0.1:3902", "f8", "n[::1]:3902", "p77", "f7", "n127.0.0.1:39020", "p900", "f21", "n*:3902", ""].join("\n");

test("netstat: the listening lines on the port, IPv4 and IPv6, and no other", () => {
  assert.deepEqual(fromNetstat(NETSTAT, 3902), [
    { address: "127.0.0.1:3902", pid: "896" },
    { address: "[::1]:3902", pid: "896" },
  ]);
  assert.deepEqual(fromNetstat(NETSTAT, 3900), []);
});

test("ss: the listening sockets on the port, with the first process ss names", () => {
  assert.deepEqual(fromSs(SS, 3902), [
    { address: "127.0.0.1:3902", pid: "4242" },
    { address: "*:3902", pid: "4300" },
    // Another user's socket: ss does not say whose.
    { address: "[::1]:3902", pid: "?" },
  ]);
  assert.deepEqual(fromSs(SS, 53), [{ address: "127.0.0.53%lo:53", pid: "512" }]);
  assert.deepEqual(fromSs(SS, 3900), []);
});

// tasklist /FO CSV /NH: one line per match; when nothing matches, a
// sentence in Windows' language and no quotes.
const TASKLIST = '"ruby.exe","4242","Console","1","45.312 K"\r\n';
const TASKLIST_NONE = "INFORMAZIONI: nessuna attività in esecuzione corrispondente ai criteri specificati.\r\n";

test("tasklist: the image name of the process asked for, and nothing for a sentence", () => {
  assert.equal(fromTasklist(TASKLIST, "4242"), "ruby.exe");
  assert.equal(fromTasklist(TASKLIST, "424"), undefined);
  assert.equal(fromTasklist(TASKLIST_NONE, "4242"), undefined);
});

// A /proc of the test's own: each path's contents, or a link's target; a
// path it does not hold cannot be read, as another user's exe cannot.
const procOf = (files: Record<string, string>): ProcFiles => {
  const read = (path: string) => {
    const found = files[path];
    if (found === undefined) throw new Error(`EACCES: permission denied, ${path}`);
    return found;
  };
  return { readlink: read, readFile: read };
};

// Node 24 on Linux, as CI's runner shows it: its main thread is named
// MainThread, which comm, ps -o comm and ss print.
const NODE_PROC = {
  "/proc/2334/comm": "MainThread\n",
  "/proc/2334/status": "Name:\tMainThread\nUmask:\t0022\nState:\tS (sleeping)\n",
  "/proc/2334/exe": "/opt/hostedtoolcache/node/24.11.0/x64/bin/node",
  "/proc/2334/cmdline": "node\0--test\0tools/lib/processes.test.ts\0",
};

test("/proc: the program a process runs, not the name its main thread was given", () => {
  assert.equal(fromProc("2334", procOf(NODE_PROC)), "node");
  // Its file replaced by an upgrade while it runs.
  assert.equal(fromProc("2334", procOf({ ...NODE_PROC, "/proc/2334/exe": "/usr/bin/node (deleted)" })), "node");
});

test("/proc: another user's process by the first argument it was started with, and nothing for one that has gone", () => {
  const theirs = (cmdline: string) => fromProc("4242", procOf({ "/proc/4242/comm": "MainThread\n", "/proc/4242/cmdline": cmdline }));
  assert.equal(theirs("/usr/bin/ruby3.4\0bin/rails\0server\0"), "ruby3.4");
  assert.equal(theirs("node\0server.js\0"), "node");
  // A title written over the arguments, path and all.
  assert.equal(theirs("puma 8.0.2 (tcp://127.0.0.1:3900) [cms]\0"), "puma");
  // A kernel thread: no file, no arguments.
  assert.equal(theirs(""), undefined);
  assert.equal(fromProc("4242", procOf({})), undefined);
});

// ps -p n -o comm=: macOS prints the program's path, other systems its
// name, and nothing when no process has the id.
test("ps: the last part of the program's path", () => {
  assert.equal(fromPs("/usr/local/bin/node\n"), "node");
  assert.equal(fromPs("ruby\n"), "ruby");
  assert.equal(fromPs(""), undefined);
});

test("processName: this process by its own id, and nothing for an id no process has", () => {
  const name = processName(String(process.pid));
  assert.ok(name && /node/i.test(name), `expected node, got ${name}`);
  assert.equal(processName("not-a-pid"), undefined);
});

test("lsof: each address on the port under the process listed before it", () => {
  assert.deepEqual(fromLsof(LSOF, 3902), [
    { address: "127.0.0.1:3902", pid: "4242" },
    { address: "[::1]:3902", pid: "4242" },
    { address: "*:3902", pid: "900" },
  ]);
  // lsof prints nothing, and exits 1, when nothing listens.
  assert.deepEqual(fromLsof("", 3902), []);
});
