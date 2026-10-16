@echo off
setlocal

set "APP_DIR=%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

rem Add common Windows tool locations used by winget, Python/pip, ffmpeg, and Chocolatey.
set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%LOCALAPPDATA%\Programs\yt-dlp;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%LOCALAPPDATA%\Programs\Python\Python310\Scripts;%APPDATA%\Python\Python312\Scripts;%APPDATA%\Python\Python311\Scripts;%APPDATA%\Python\Python310\Scripts;C:\Program Files\ffmpeg\bin;C:\Program Files\Gyan\ffmpeg\bin;C:\ProgramData\chocolatey\bin;%PATH%"

if not exist "%NODE_EXE%" (
  echo Bundled Codex Node.js was not found.
  echo Install Node.js from https://nodejs.org/ and run: npm start
  pause
  exit /b 1
)

echo Checking tools...
where yt-dlp >nul 2>nul
if errorlevel 1 (
  echo yt-dlp was not found by this app.
  echo If yt-dlp works in another PowerShell window, close and reopen that window, then run this file again.
  echo You can also set YTDLP_PATH to the full yt-dlp.exe path.
) else (
  for /f "delims=" %%i in ('where yt-dlp') do echo Found yt-dlp: %%i
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo ffmpeg was not found by this app.
) else (
  for /f "delims=" %%i in ('where ffmpeg') do echo Found ffmpeg: %%i
)

echo.
echo Starting Video Clipper at http://localhost:3030
"%NODE_EXE%" "%APP_DIR%server.js"
