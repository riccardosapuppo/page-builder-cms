# Sends a real Ctrl+C to npm start on Windows, as a terminal does, for
# tools/start/interrupt-check.ts. Node cannot do it: on Windows,
# process.kill with SIGINT ends a process outright, with no signal at all.
#
# A console's Ctrl+C reaches every process attached to that console, so
# this script must run in a console of its own. interrupt-check.ts starts
# it with its three standard streams piped and windowsHide, which Windows
# answers with a new console that has no window. Before sending anything
# the script asks the console which processes it holds, and sends nothing
# (exit 2) unless every one is this script or a process it started.
#
# It starts `node tools/start.cjs --no-open` on its console, passes each
# line it prints on to its own output, sends Ctrl+C once a line says
# "[start] ready:", passes on the rest, and ends with "HELPER: start
# exited <code>". Exit 0 when that happened, 1 when start was not ready or
# did not stop in time (its tree is then killed), 2 when it could not run.
param(
  [Parameter(Mandatory = $true)][string]$Node,
  [Parameter(Mandatory = $true)][string]$Start,
  [int]$ReadySeconds = 300,
  [int]$StopSeconds = 60
)
$ErrorActionPreference = "Stop"

Add-Type -Namespace PbcConsole -Name Native -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool GenerateConsoleCtrlEvent(uint ctrlEvent, uint processGroupId);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
[DllImport("kernel32.dll", SetLastError = true)] public static extern uint GetConsoleProcessList(uint[] processIds, uint count);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
"@

function Say([string]$line) {
  [Console]::Out.WriteLine("HELPER: $line")
  [Console]::Out.Flush()
}

function Pass([string]$line) {
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
}

function ConsoleProcesses {
  $ids = New-Object uint32[] 256
  $count = [PbcConsole.Native]::GetConsoleProcessList($ids, 256)
  if ($count -eq 0) { return @() }
  return @($ids[0..($count - 1)] | ForEach-Object { [int]$_ })
}

# This script and every process below it.
function Tree([int]$root) {
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $found = @{ $root = $true }
  do {
    $grew = $false
    foreach ($process in $all) {
      if ($found.ContainsKey([int]$process.ParentProcessId) -and -not $found.ContainsKey([int]$process.ProcessId)) {
        $found[[int]$process.ProcessId] = $true
        $grew = $true
      }
    }
  } while ($grew)
  return $found
}

function Foreign {
  $tree = Tree $PID
  return @(ConsoleProcesses | Where-Object { -not $tree.ContainsKey($_) })
}

# Reads lines and passes them on until one starts with $until (returns it),
# the stream ends (returns $null), or the time is up (returns "").
function Relay($process, [string]$until, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  $pending = $process.StandardOutput.ReadLineAsync()
  while ($true) {
    if (-not $pending.Wait(500)) {
      if ((Get-Date) -gt $deadline) { return "" }
      continue
    }
    $line = $pending.Result
    if ($null -eq $line) { return $null }
    Pass $line
    if ($until -and $line.StartsWith($until)) { return $line }
    $pending = $process.StandardOutput.ReadLineAsync()
  }
}

Say "console window $([PbcConsole.Native]::GetConsoleWindow()), processes on it: $((ConsoleProcesses) -join ', '); this script is $PID"
$foreign = Foreign
if ($foreign.Count -gt 0) {
  Say "this console is shared with processes not started here ($($foreign -join ', ')): a Ctrl+C would reach them, so nothing is sent"
  exit 2
}

# Whether a process ignores Ctrl+C is inherited from the process that
# started it, and a program started from a background service may have
# been told to ignore it. A terminal's children do not: this script takes
# Ctrl+C back before it starts npm start, which inherits that.
[PbcConsole.Native]::SetConsoleCtrlHandler([IntPtr]::Zero, $false) | Out-Null

$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = $Node
$info.Arguments = "`"$Start`" --no-open"
$info.UseShellExecute = $false
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
# On this console, as a terminal's child is on the terminal's.
$info.CreateNoWindow = $false
# Not $start: PowerShell's names ignore case, and $Start is the path,
# typed as a string, which would turn the process into its name.
$child = [System.Diagnostics.Process]::Start($info)
$errors = $child.StandardError.ReadToEndAsync()
Say "started node tools/start.cjs --no-open, process $($child.Id)"

$ready = Relay $child "[start] ready:" $ReadySeconds
if (-not $ready) {
  Say "start was not ready within $ReadySeconds s, or stopped first"
  taskkill /PID $child.Id /T /F | Out-Null
  exit 1
}

$foreign = Foreign
Say "processes on this console now: $((ConsoleProcesses) -join ', ')"
if ($foreign.Count -gt 0) {
  Say "processes not started here joined this console ($($foreign -join ', ')): no Ctrl+C is sent"
  taskkill /PID $child.Id /T /F | Out-Null
  exit 2
}

# This script ignores the Ctrl+C it sends; start and its children do not.
[PbcConsole.Native]::SetConsoleCtrlHandler([IntPtr]::Zero, $true) | Out-Null
Say "sending Ctrl+C to this console"
if (-not [PbcConsole.Native]::GenerateConsoleCtrlEvent(0, 0)) {
  Say "GenerateConsoleCtrlEvent failed with error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  taskkill /PID $child.Id /T /F | Out-Null
  exit 2
}

$end = Relay $child "" $StopSeconds
if ($end -eq "" -or -not $child.WaitForExit(5000)) {
  Say "start did not exit within $StopSeconds s of the Ctrl+C"
  taskkill /PID $child.Id /T /F | Out-Null
  exit 1
}
$rest = $errors.Result
if ($rest) { Pass $rest.TrimEnd() }
Say "start exited $($child.ExitCode)"
exit 0
