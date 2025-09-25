@echo off
echo Testing ITMS Desktop Shortcut...
echo.

REM Check if the shortcut exists
set "shortcutPath=%USERPROFILE%\Desktop\ITMS Cockpit.lnk"
if not exist "%shortcutPath%" (
    echo ERROR: Desktop shortcut not found at %shortcutPath%
    echo Please run create-desktop-shortcut.ps1 first
    pause
    exit /b 1
)

echo Desktop shortcut found: %shortcutPath%
echo.

REM Check if the target files exist
set "targetPath=%~dp0start-itms.cmd"
if not exist "%targetPath%" (
    echo ERROR: start-itms.cmd not found at %targetPath%
    pause
    exit /b 1
)

echo Target file found: %targetPath%
echo.

REM Check if package.json exists (project root indicator)
if not exist "package.json" (
    echo ERROR: package.json not found. Are you in the correct directory?
    echo Current directory: %CD%
    pause
    exit /b 1
)

echo Project files verified successfully!
echo.
echo You can now test the desktop shortcut by double-clicking "ITMS Cockpit" on your desktop.
echo If it still doesn't work, check the logs folder for detailed error information.
echo.
pause
