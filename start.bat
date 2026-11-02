@echo off
setlocal
cd /d "%~dp0"

if not exist "index.html" (
  echo [ERROR] 找不到 index.html，请确认文件完整。
  echo 当前目录：%CD%
  pause
  exit /b 1
)

rem 用默认浏览器打开；失败时退回资源管理器
start "" "%~dp0index.html"
if errorlevel 1 explorer "%~dp0index.html"
exit /b 0
