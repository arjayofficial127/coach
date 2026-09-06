@echo off
setlocal
cd /d "%~dp0"

set "COACH_NODE_BIN=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%COACH_NODE_BIN%\node.exe" set "PATH=%COACH_NODE_BIN%;%PATH%"

set "COACH_NODE_MAJOR="
for /f "tokens=1 delims=." %%A in ('node -p "process.versions.node" 2^>nul') do set "COACH_NODE_MAJOR=%%A"

if not defined COACH_NODE_MAJOR goto :node_missing
if %COACH_NODE_MAJOR% LSS 24 goto :node_old

if /i "%~1"=="--check" (
  echo Coach Browser launcher is ready with Node.js:
  node --version
  exit /b 0
)

echo.
echo   Coach Browser
echo   Using Node.js:
node --version
echo   Starting the browser...
echo.

call pnpm.cmd start
if errorlevel 1 goto :start_failed
goto :done

:node_missing
echo.
echo Coach Browser needs Node.js 24 or newer, but Node.js was not found.
echo Install the current Node.js LTS release and run START-COACH.cmd again.
pause
exit /b 1

:node_old
echo.
echo Coach Browser needs Node.js 24 or newer.
echo This terminal found Node.js:
node --version
echo Install the current Node.js LTS release and run START-COACH.cmd again.
pause
exit /b 1

:start_failed
echo.
echo Coach Browser stopped with an error. Review the output above for details.
pause
exit /b 1

:done
endlocal
