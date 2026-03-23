import socket
import subprocess
import sys
import time
import tkinter as tk
import traceback
import webbrowser
from pathlib import Path
from tkinter import messagebox


BASE_DIR = Path(__file__).resolve().parent
LOG_PATH = BASE_DIR / "launcher.log"
SERVER_LOG_PATH = BASE_DIR / "server.log"
HOST = "127.0.0.1"
PORT = 8000
URL = f"http://{HOST}:{PORT}"
STARTUP_TIMEOUT_SECONDS = 60.0


def write_log(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with LOG_PATH.open("a", encoding="utf-8") as log_file:
        log_file.write(f"[{timestamp}] {message}\n")


def get_python_executable() -> str:
    current = Path(sys.executable)
    sibling = current.with_name("python.exe")
    if sibling.exists():
        return str(sibling)
    return str(current)


class PlantLabelLauncher:
    def __init__(self) -> None:
        write_log("launcher init start")
        self.root = tk.Tk()
        self.root.title("식물 라벨 도우미")
        self.root.geometry("420x250")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        self.server_process: subprocess.Popen | None = None
        self.browser_opened = False
        self.server_log_handle = None
        self.server_log_offset = 0

        self.status_var = tk.StringVar(value="프로그램을 시작할 준비가 되었습니다.")

        self.build_ui()
        self.root.after(300, self.start_server)
        write_log("launcher init complete")

    def build_ui(self) -> None:
        frame = tk.Frame(self.root, padx=20, pady=20)
        frame.pack(fill="both", expand=True)

        title = tk.Label(
            frame,
            text="식물 라벨 도우미",
            font=("Malgun Gothic", 18, "bold"),
        )
        title.pack(anchor="w")

        description = tk.Label(
            frame,
            text="버튼만 누르면 입력 화면이 열리고 종료할 수 있습니다.",
            font=("Malgun Gothic", 10),
        )
        description.pack(anchor="w", pady=(6, 14))

        status_box = tk.Label(
            frame,
            textvariable=self.status_var,
            justify="left",
            anchor="w",
            relief="groove",
            padx=12,
            pady=12,
            font=("Malgun Gothic", 10),
            wraplength=360,
        )
        status_box.pack(fill="x")

        button_row = tk.Frame(frame, pady=18)
        button_row.pack(fill="x")

        self.open_button = tk.Button(
            button_row,
            text="입력 화면 열기",
            width=14,
            command=self.open_browser,
            font=("Malgun Gothic", 10, "bold"),
        )
        self.open_button.pack(side="left")

        self.stop_button = tk.Button(
            button_row,
            text="프로그램 종료",
            width=14,
            command=self.on_close,
            font=("Malgun Gothic", 10),
        )
        self.stop_button.pack(side="right")

        help_text = tk.Label(
            frame,
            text="입력 화면이 안 보이면 '입력 화면 열기'를 다시 눌러 보세요.",
            font=("Malgun Gothic", 9),
            fg="#5a6655",
        )
        help_text.pack(anchor="w")

    def is_server_up(self) -> bool:
        try:
            with socket.create_connection((HOST, PORT), timeout=1):
                return True
        except OSError:
            return False

    def server_log_indicates_ready(self) -> bool:
        if not SERVER_LOG_PATH.exists():
            return False
        try:
            content = SERVER_LOG_PATH.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return False
        recent_content = content[self.server_log_offset :]
        return f"Uvicorn running on http://{HOST}:{PORT}" in recent_content

    def wait_for_server(self, timeout: float = STARTUP_TIMEOUT_SECONDS) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.server_process and self.server_process.poll() is not None:
                write_log(f"server process exited early with code {self.server_process.returncode}")
                return False
            if self.server_log_indicates_ready() or self.is_server_up():
                return True
            time.sleep(0.3)
        return False

    def read_server_log_tail(self) -> str:
        if not SERVER_LOG_PATH.exists():
            return "server.log not found"
        try:
            lines = SERVER_LOG_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError as error:
            return f"failed to read server.log: {error}"
        tail = lines[-20:]
        return "\n".join(tail) if tail else "server.log is empty"

    def start_server(self) -> None:
        if self.server_process and self.server_process.poll() is None:
            return

        write_log("start_server called")
        self.status_var.set("프로그램을 시작하고 있습니다. 처음 실행은 1분 정도 걸릴 수 있습니다.")

        python_executable = get_python_executable()
        command = [
            python_executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            HOST,
            "--port",
            str(PORT),
        ]

        self.server_log_offset = SERVER_LOG_PATH.stat().st_size if SERVER_LOG_PATH.exists() else 0
        self.server_log_handle = SERVER_LOG_PATH.open("a", encoding="utf-8")
        self.server_log_handle.write(f"\n=== server start {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
        self.server_log_handle.flush()

        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        try:
            self.server_process = subprocess.Popen(
                command,
                cwd=BASE_DIR,
                stdout=self.server_log_handle,
                stderr=self.server_log_handle,
                creationflags=creationflags,
            )
            write_log(f"server process started pid={self.server_process.pid}")
        except Exception:
            write_log(f"server process start error\n{traceback.format_exc()}")
            self.status_var.set("입력 화면을 시작하지 못했습니다.")
            messagebox.showerror(
                "실행 실패",
                f"입력 화면을 시작하지 못했습니다.\n\n오류 기록 파일: {LOG_PATH}",
            )
            return

        self.root.after(200, self.finish_startup)

    def finish_startup(self) -> None:
        write_log("finish_startup check")
        if self.wait_for_server():
            write_log("server ready")
            self.status_var.set("준비가 끝났습니다. 입력 화면이 자동으로 열립니다.")
            self.open_browser()
            return

        server_log_tail = self.read_server_log_tail()
        write_log(f"server start failed\n{server_log_tail}")
        self.status_var.set("입력 화면을 시작하지 못했습니다.")
        messagebox.showerror(
            "실행 실패",
            "입력 화면을 시작하지 못했습니다.\n\n"
            f"오류 기록 파일:\n{LOG_PATH}\n{SERVER_LOG_PATH}",
        )

    def open_browser(self) -> None:
        if self.server_process and self.server_process.poll() is not None:
            self.status_var.set("아직 준비 중입니다. 잠시 뒤 다시 시도해 주세요.")
            write_log("open_browser called before server ready")
            return

        write_log("browser open")
        webbrowser.open(URL)
        self.browser_opened = True
        self.status_var.set("입력 화면이 열렸습니다. 작업을 마치면 이 창에서 종료해 주세요.")

    def stop_server(self) -> None:
        if self.server_process and self.server_process.poll() is None:
            write_log("terminating server process")
            self.server_process.terminate()
            try:
                self.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                write_log("killing server process")
                self.server_process.kill()
                self.server_process.wait(timeout=5)

        if self.server_log_handle:
            self.server_log_handle.close()
            self.server_log_handle = None

    def on_close(self) -> None:
        write_log("launcher closing")
        self.status_var.set("프로그램을 종료하고 있습니다.")
        self.stop_button.config(state="disabled")
        self.open_button.config(state="disabled")
        self.stop_server()
        self.root.after(400, self.root.destroy)

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    try:
        write_log("process start")
        PlantLabelLauncher().run()
        write_log("process end")
    except Exception as error:
        write_log(f"fatal error\n{traceback.format_exc()}")
        messagebox.showerror(
            "실행 오류",
            f"프로그램 실행 중 오류가 발생했습니다.\n\n{error}\n\n오류 기록 파일: {LOG_PATH}",
        )
