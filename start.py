from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
BACKEND_PORT = "8000"
FRONTEND_PORT = "5173"


def kill_port(port: str) -> None:
    try:
        result = subprocess.run(
            ["lsof", "-ti", f"tcp:{port}"],
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return

    for raw_pid in result.stdout.splitlines():
        try:
            os.kill(int(raw_pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError, ValueError):
            pass


def stream(name: str, process: subprocess.Popen[str]) -> None:
    assert process.stdout is not None
    for line in process.stdout:
        print(f"[{name}] {line}", end="", flush=True)


def start_processes() -> list[subprocess.Popen[str]]:
    env = os.environ.copy()
    env["VITE_API_BASE"] = f"http://127.0.0.1:{BACKEND_PORT}"

    backend = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            BACKEND_PORT,
        ],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    frontend = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", FRONTEND_PORT],
        cwd=FRONTEND,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    for name, process in [("backend", backend), ("frontend", frontend)]:
        thread = threading.Thread(target=stream, args=(name, process), daemon=True)
        thread.start()

    return [backend, frontend]


def main() -> int:
    print("Restarting backend and frontend...")
    kill_port(BACKEND_PORT)
    kill_port(FRONTEND_PORT)
    processes = start_processes()
    print(f"Backend:  http://127.0.0.1:{BACKEND_PORT}")
    print(f"Docs:     http://127.0.0.1:{BACKEND_PORT}/docs")
    print(f"Frontend: http://127.0.0.1:{FRONTEND_PORT}")
    print("Press Ctrl+C to stop both services.")

    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping services...")
        for process in processes:
            if process.poll() is None:
                process.terminate()
        time.sleep(1)
        for process in processes:
            if process.poll() is None:
                process.kill()

    return max((process.returncode or 0) for process in processes)


if __name__ == "__main__":
    raise SystemExit(main())
