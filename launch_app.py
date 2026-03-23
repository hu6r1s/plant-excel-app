from pathlib import Path
import runpy
import time
import traceback
import tkinter as tk
from tkinter import messagebox


BASE_DIR = Path(__file__).resolve().parent
LOG_PATH = BASE_DIR / "launcher.log"


def write_log(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    with LOG_PATH.open("a", encoding="utf-8") as log_file:
        log_file.write(f"[{timestamp}] {message}\n")


if __name__ == "__main__":
    try:
        write_log("launch_app.py start")
        runpy.run_path(str(BASE_DIR / "start_app.py"), run_name="__main__")
    except Exception as error:
        write_log(f"launch_app.py fatal error\n{traceback.format_exc()}")
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "실행 오류",
            f"프로그램 실행 중 오류가 발생했습니다.\n\n{error}\n\n오류 기록 파일: {LOG_PATH}",
        )
        root.destroy()
