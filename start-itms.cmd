@echo off
setlocal
set SCRIPT_DIR=%~dp0

REM Change to the script directory to ensure proper working directory
cd /d "%SCRIPT_DIR%"

REM Verify we're in the right directory
if not exist "package.json" (
  echo ERROR: package.json not found. Please ensure this script is run from the ITMS project directory.
  echo Current directory: %CD%
  pause
  exit /b 1
)

echo Starting ITMS from directory: %CD%
echo.

REM Run the PowerShell script
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-itms.ps1" -Prod
set EXITCODE=%ERRORLEVEL%

if not %EXITCODE%==0 (
  echo.
  echo Failed to start ITMS (exit %EXITCODE%). See logs\launch-*.log for details.
  echo.
  echo Press any key to close this window...
  pause >nul
)

endlocal & exit /b %EXITCODE%
