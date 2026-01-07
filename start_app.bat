@echo off
chcp 65001 >nul
setlocal

:: ==============================
:: Configuration Area
:: ==============================
set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python and add to PATH.
    pause
    exit /b
)

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js and add to PATH.
    pause
    exit /b
)

echo ========================================================
echo      Bilibili Magic Market - Quick Start Script
echo ========================================================
echo.

:: ==============================
:: Start Backend
:: ==============================
echo [1/2] Starting Backend Service (FastAPI)...
cd /d "%BACKEND_DIR%"

:: Install backend dependencies if needed (simple check)
python -c "import fastapi, uvicorn, sqlalchemy, pymysql" >nul 2>&1
if errorlevel 1 (
    echo Installing backend dependencies...
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b
    )
)

:: Start backend in new window using python -m uvicorn
start "MagicMarket Backend" cmd /k "title MagicMarket Backend && echo Starting Backend... && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8111"

:: ==============================
:: Start Frontend
:: ==============================
echo [2/2] Starting Frontend Service (React/Vite)...
cd /d "%FRONTEND_DIR%"

:: Check node_modules
if not exist "node_modules" (
    echo First run detected, installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b
    )
)

:: Start frontend in new window
start "MagicMarket Frontend" cmd /k "title MagicMarket Frontend && echo Starting Frontend... && npm run dev"

echo.
echo ========================================================
echo      Services Started!
echo      Backend: http://127.0.0.1:8111/docs
echo      Frontend: http://localhost:5173
echo ========================================================
echo.
echo Press any key to STOP all services and exit...
echo (Please use this key press to exit, closing the window directly will leave processes running)
pause >nul

echo Stopping services...
:: 1. Close the windows
taskkill /FI "WINDOWTITLE eq MagicMarket Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq MagicMarket Frontend*" /T /F >nul 2>&1

:: 2. Force kill by port (ensure they are dead)
:: Backend (8111)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8111" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
:: Frontend (5173)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

echo Done.

