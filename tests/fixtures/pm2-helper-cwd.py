"""Exercise the real helper across Linux accounts without touching host config."""
import os
import pathlib
import pwd
import shutil
import socket
import subprocess
import sys
import tempfile

account = pwd.getpwnam("nobody")
scratch = pathlib.Path(tempfile.mkdtemp(prefix="pm2-helper-cwd-"))
try:
    scratch.chmod(0o755)
    private = scratch / "caller-private"
    private.mkdir(mode=0o700)
    home = scratch / "pm2-home"
    home.mkdir(mode=0o700)
    os.chown(home, account.pw_uid, account.pw_gid)
    rpc = socket.socket(socket.AF_UNIX)
    rpc.bind(str(home / "rpc.sock"))
    os.chown(home / "rpc.sock", account.pw_uid, account.pw_gid)
    binary = scratch / "fake-pm2"
    binary.write_text("#!/bin/sh\nset -eu\ntest \"$PWD\" = \"$PM2_HOME\"\n/usr/bin/python3 -c 'import subprocess; subprocess.run([\"/bin/true\"], check=True)'\nprintf '%s\\n' \"$PWD\" \"$*\"\n")
    binary.chmod(0o755)
    config = scratch / "pm2-monitor.conf"
    config.write_text(f"nobody|{home}|{binary}|/usr/bin\n")
    config.chmod(0o644)
    helper = scratch / "pm2-read"
    source = pathlib.Path(sys.argv[1]).read_text().replace(
        "TASK_CONFIG=/etc/system-ops/pm2-monitor.conf", f"TASK_CONFIG={config}")
    helper.write_text(source.replace(' --chdir="$TASK_HOME"', ''))
    helper.chmod(0o755)
    inherited = subprocess.run([str(helper), "nobody", "jlist"], cwd=private,
                               capture_output=True)
    assert inherited.returncode != 0, "The inherited-directory regression was not reproduced"
    helper.write_text(source)
    for args in (["jlist"], ["logs", "3", "--nostream", "--lines", "100"]):
        result = subprocess.run([str(helper), "nobody", *args], cwd=private,
                                capture_output=True, text=True, check=True)
        assert result.stdout.splitlines() == [str(home), " ".join(args)], result.stdout
    denied = subprocess.run([str(helper), "nobody", "delete", "all"], cwd=private,
                            capture_output=True)
    assert denied.returncode != 0
    rpc.close()
    (home / "rpc.sock").unlink()
    missing = subprocess.run([str(helper), "nobody", "jlist"], cwd=private,
                             capture_output=True, text=True)
    assert missing.returncode != 0
    assert "PM2 daemon absent or inaccessible" in missing.stderr
    print("PM2 helper: private caller cwd, jlist, logs and absent-daemon guard passed")
finally:
    shutil.rmtree(scratch)
