@echo off
cd /d "%~dp0"
set LOGFILE=%~dp0launcher_bootstrap.log
echo ==== install_and_run started ==== > "%LOGFILE%"

where py >nul 2>nul
if errorlevel 1 (
  echo py command not found >> "%LOGFILE%"
  echo Python is not installed or py was not found.
  echo Install Python 3.11 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo creating venv >> "%LOGFILE%"
  py -m venv .venv
  if errorlevel 1 (
    echo venv creation failed >> "%LOGFILE%"
    echo Failed to create virtual environment.
    pause
    exit /b 1
  )
)

echo ensuring pip >> "%LOGFILE%"
".venv\Scripts\python.exe" -m ensurepip --upgrade >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo ensurepip failed >> "%LOGFILE%"
  echo Failed to prepare pip in the virtual environment.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" -m pip install --upgrade pip >> "%LOGFILE%" 2>&1
".venv\Scripts\python.exe" -m pip install -r requirements.txt >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  echo pip install failed >> "%LOGFILE%"
  echo Installation failed. Check launcher_bootstrap.log
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
