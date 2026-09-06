@echo off
setlocal
cd /d "%~dp0"

echo.
echo   Coach Browser website
echo   Starting the local preview...
echo.

if exist "node_modules\.bin\vite.cmd" (
  call "node_modules\.bin\vite.cmd" --configLoader runner --open
  goto :done
)

if exist "..\..\node_modules\.bin\vite.cmd" (
  call "..\..\node_modules\.bin\vite.cmd" --configLoader runner --open
  goto :done
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm is required. Install Node.js and pnpm, then run this file again.
  pause
  exit /b 1
)

call pnpm install --ignore-workspace
if errorlevel 1 goto :failed
call pnpm run open
goto :done

:failed
echo.
echo The website dependencies could not be installed.
pause
exit /b 1

:done
endlocal
