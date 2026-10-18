@echo off
chcp 65001 >nul
echo 本地预览：http://127.0.0.1:8099/   （Ctrl+C 停止）
where serve >nul 2>nul
if %errorlevel%==0 (
  serve "%~dp0" -l 8099 --no-clipboard
) else (
  npx --yes serve "%~dp0" -l 8099 --no-clipboard
)
