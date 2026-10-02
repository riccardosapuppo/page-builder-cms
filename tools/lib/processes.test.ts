// node --test tools/lib/processes.test.ts
//
// The three readers of "who listens on this port", fed text in the shape
// each system prints, on any system: the ss and lsof readers are what
// Linux and macOS take, and this is where they run on Windows too. The
// samples follow the formats of netstat -a -n -o (Windows 11), ss -H -l -t
// -n -p (iproute2) and lsof -F pn, with the lines a reader must skip next
// to the ones it must find.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromLsof, fromNetstat, fromSs } from "./processes.ts";

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

test("lsof: each address on the port under the process listed before it", () => {
  assert.deepEqual(fromLsof(LSOF, 3902), [
    { address: "127.0.0.1:3902", pid: "4242" },
    { address: "[::1]:3902", pid: "4242" },
    { address: "*:3902", pid: "900" },
  ]);
  // lsof prints nothing, and exits 1, when nothing listens.
  assert.deepEqual(fromLsof("", 3902), []);
});
