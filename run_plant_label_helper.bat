@echo off
cd /d "%~dp0"
set LOGFILE=%~dp0launcher_bootstrap.log
echo ==== run_plant_label_helper started ==== > "%LOGFILE%"

if not exist ".venv\Scripts\python.exe" (
  echo venv python not found >> "%LOGFILE%"
  echo Python virtual environment was not found.
  echo Run install_and_run.bat first.
  pause
  exit /b 1
)

if exist ".venv\Scripts\pythonw.exe" (
  echo launching with pythonw >> "%LOGFILE%"
  start "" /D "%~dp0" ".venv\Scripts\pythonw.exe" "%~dp0launch_app.py"
) else (
  echo launching with python >> "%LOGFILE%"
  start "" /D "%~dp0" ".venv\Scripts\python.exe" "%~dp0launch_app.py"
)
