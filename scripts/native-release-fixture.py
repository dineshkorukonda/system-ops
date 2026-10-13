"""Real installer/account/sudo/systemd validation on a disposable GitHub VM only."""
import hashlib
import json
import os
import pathlib
import pty
import select
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error

if not (sys.platform == "linux" and os.geteuid() == 0 and
        os.environ.get("GITHUB_ACTIONS") == "true" and
        os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"):
    sys.exit("Native fixture requires root on a disposable GitHub-hosted Linux VM.")

root = pathlib.Path("/opt/system-ops")
if root.exists() or subprocess.run(["id", "ops"], capture_output=True).returncode == 0:
    sys.exit("Refusing to touch an existing installation or ops account.")
if pathlib.Path("/etc/systemd/system/system-ops.service").exists():
    sys.exit("Refusing an existing System Ops service.")
source = pathlib.Path.cwd()
subprocess.check_call(["git", "config", "--global", "--add", "safe.directory", str(source)])
scratch = pathlib.Path(tempfile.mkdtemp(prefix="ops-native-ci-"))
scratch.chmod(0o755)
password = secrets.token_hex(24)
artifacts = source / "artifacts"
artifacts.mkdir(exist_ok=True)

def run(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()

def api(route, payload=None):
    headers = {"Authorization": "Bearer " + password}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    request = urllib.request.Request("http://127.0.0.1:9080" + route, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response)

def ready():
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            if api("/ready")["ok"] and api("/api/v2/history") is not None:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("Native service did not become ready")

def install():
    pid, master = pty.fork()
    if pid == 0:
        os.chdir(source)
        environment = dict(os.environ, PATH="/usr/sbin:/usr/bin:/sbin:/bin")
        os.execve("/usr/bin/bash", ["bash", "scripts/install.sh"], environment)
    transcript = ""
    seen = set()
    deadline = time.monotonic() + 900
    prompts = [("Enter Admin Dashboard Password:", password),
               ("Confirm Admin Dashboard Password:", password),
               ("Enable automatic daily updates?", "n"),
               ("Do you want to configure a custom domain", "n")]
    try:
        while time.monotonic() < deadline:
            if select.select([master], [], [], 1)[0]:
                try:
                    chunk = os.read(master, 65536).decode(errors="replace")
                except OSError:
                    break
                transcript += chunk
                for prompt, answer in prompts:
                    if prompt in transcript and prompt not in seen:
                        os.write(master, (answer + "\n").encode())
                        seen.add(prompt)
            exited, status = os.waitpid(pid, os.WNOHANG)
            if exited:
                if os.waitstatus_to_exitcode(status) != 0:
                    raise RuntimeError("Installer exited unsuccessfully")
                return
        else:
            os.kill(pid, 15)
            raise RuntimeError("Installer timed out")
        _, status = os.waitpid(pid, 0)
        if os.waitstatus_to_exitcode(status) != 0:
            raise RuntimeError("Installer exited unsuccessfully")
    finally:
        os.close(master)
        (artifacts / "native-install.log").write_text(transcript.replace(password, "[REDACTED]"))

try:
    install()
    # node/npm PATH and the fixed unit executable must describe the same runtime.
    assert run("/usr/bin/node", "--version").startswith("v24.")
    ready()
    run("visudo", "-cf", "/etc/sudoers.d/system-ops-update")
    assert (root / ".env").stat().st_mode & 0o777 == 0o600
    assert run("systemctl", "show", "system-ops.service", "--property=User", "--value") == "ops"
    assert run("runuser", "-u", "ops", "--", "test", "-r", str(root / ".env")) == ""
    env_digest = hashlib.sha256((root / ".env").read_bytes()).hexdigest()
    # A local origin makes activation deterministic and includes this PR commit.
    origin = scratch / "origin.git"
    run("git", "clone", "--bare", "--no-hardlinks", str(source), str(origin))
    revision = run("git", "rev-parse", "HEAD", cwd=source)
    run("git", "--git-dir", str(origin), "update-ref", "refs/heads/main", revision)
    run("git", "--git-dir", str(origin), "symbolic-ref", "HEAD", "refs/heads/main")
    run("chown", "-R", "ops:ops", str(origin))
    run("runuser", "-u", "ops", "--", "git", "-C", str(root), "remote", "set-url", "origin", str(origin))
    run("runuser", "-u", "ops", "--", "git", "-C", str(root), "config", "user.name", "CI fixture")
    run("runuser", "-u", "ops", "--", "git", "-C", str(root), "config", "user.email", "fixture@example.invalid")
    with (root / "README.md").open("a") as target:
        target.write("\nCI stash preservation marker\n")
    run("runuser", "-u", "ops", "--", "git", "-C", str(root), "stash", "push", "-m", "native-fixture")
    with (root / "README.md").open("a") as target:
        target.write("\nCI working file preservation marker\n")
    working_digest = hashlib.sha256((root / "README.md").read_bytes()).hexdigest()
    (root / "data" / "native-preserve").write_text("preserve shared data")
    assert api("/api/v2/system/update", {"password":password})["success"]
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        try:
            state = api("/api/v2/system/update/status")
            if state.get("failed"):
                raise RuntimeError("Native background updater failed")
            if state.get("success") and not state.get("running"):
                break
        except (urllib.error.URLError, TimeoutError):
            pass  # The service restart interrupts requests by design.
        time.sleep(2)
    else:
        raise RuntimeError("Native background updater timed out")
    ready()
    assert (root / "current").is_symlink()
    assert (root / "current" / ".release-revision").read_text().strip() == revision
    assert hashlib.sha256((root / "README.md").read_bytes()).hexdigest() == working_digest
    assert hashlib.sha256((root / ".env").read_bytes()).hexdigest() == env_digest
    assert "native-fixture" in run("runuser", "-u", "ops", "--", "git", "-C", str(root), "stash", "list")
    assert (root / "data" / "native-preserve").read_text() == "preserve shared data"
    # Use actual systemd restarts with the activation helper for rollback/interruption.
    fixture = scratch / "activation.cjs"
    fixture.write_text("""
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root='/opt/system-ops';
const {activate,recover}=require(root+'/current/src/services/atomicRelease');
const previous=fs.realpathSync(root+'/current'),bad=root+'/releases/bad-native-fixture';
fs.mkdirSync(bad);fs.mkdirSync(bad+'/src');
fs.writeFileSync(bad+'/src/start.js',"require('http').createServer((q,r)=>{r.statusCode=503;r.end('injected failure')}).listen(9080,'127.0.0.1')");
const restart=async()=>execFileSync('systemctl',['restart','system-ops.service']);
const ready=async()=>{for(let n=0;n<30;n++){try{const r=await fetch('http://127.0.0.1:9080/ready',{signal:AbortSignal.timeout(500)});if(r.ok)return true;}catch{}await new Promise(r=>setTimeout(r,200));}return false;};
(async()=>{
let rolled=false;try{await activate({root,release:bad,validate:async()=>{},restart,ready});}catch(e){if(!e.message.includes('rolled back'))throw e;rolled=true;}
if(!rolled||fs.realpathSync(root+'/current')!==previous)throw new Error('Rollback failed');
fs.writeFileSync(root+'/.release-journal.json',JSON.stringify({previous,release:bad}));
await recover({root,restart,ready});
if(fs.existsSync(root+'/.release-journal.json'))throw new Error('Journal retained');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
""")
    run("/usr/bin/node", str(fixture))
    ready()
    # The recovery wrapper must also preserve dirty files/stashes/configuration.
    run("bash", str(root / "scripts" / "recover.sh"))
    assert hashlib.sha256((root / "README.md").read_bytes()).hexdigest() == working_digest
    assert hashlib.sha256((root / ".env").read_bytes()).hexdigest() == env_digest
    assert "native-fixture" in run("runuser", "-u", "ops", "--", "git", "-C", str(root), "stash", "list")
    (artifacts / "native-release-fixture.json").write_text(json.dumps({
        "revision":revision,"node":run("/usr/bin/node","--version"),
        "osRelease":pathlib.Path("/etc/os-release").read_text(),
        "verified":["clean interactive installer","ops account and environment permissions",
                    "validated exact sudoers launcher","authenticated dashboard background update",
                    "actual systemd activation and readiness rollback","interrupted journal recovery",
                    "recovery preserves working files, stashes, environment and shared data"],
        "limitations":["Disposable GitHub Ubuntu VM; no production host changed.",
                       "No 24-hour soak or independent uptime claim."]},indent=2))
    print("PASS: native installer, account, sudoers, dashboard update, rollback, and recovery")
finally:
    for name in ["system-ops-update.service", "system-ops.service"]:
        subprocess.run(["systemctl","stop",name],capture_output=True)
    # The VM is discarded by GitHub. Preserve files/logs for artifact collection.
    logfile = root / "data" / "update.log"
    if logfile.exists():
        (artifacts / "native-update.log").write_text(logfile.read_text().replace(password,"[REDACTED]"))
