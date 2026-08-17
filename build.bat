@echo off
chcp 65001 >nul
REM ============================================================
REM  构建《职场营销博弈》单文件 exe（等价于 pyinstaller build.spec）
REM  需先安装打包工具：pip install pyinstaller
REM  产物：dist\职场营销博弈.exe
REM ============================================================
setlocal
cd /d "%~dp0"

where pyinstaller >nul 2>nul
if errorlevel 1 (
    echo [build] 未检测到 pyinstaller，尝试用 python -m PyInstaller ...
    python -m PyInstaller build.spec
) else (
    pyinstaller build.spec
)

if errorlevel 1 (
    echo [build] 构建失败，请确认已安装 pyinstaller（pip install pyinstaller）且位于项目根目录。
    pause
    exit /b 1
)

if exist "dist\职场营销博弈.exe" (
    echo [build] 完成：dist\职场营销博弈.exe
) else (
    echo [build] 警告：未在 dist\ 找到产物，请检查上方日志。
)
endlocal
pause
