@echo off
:: Inzora Terra OS - Start Both Servers
:: ======================================

:: Change to backend directory
cd /d "C:\Users\afraz ahamed k m\Downloads\project catalyst\backend"

:: Start backend API server (runs in background)
start "Backend" python -m backend.api.main
echo Backend starting on http://127.0.0.1:8000

:: Wait a moment for backend to start
timeout /t 3 /nobreak >nul

:: Change to frontend directory
cd /d "C:\Users\afraz ahamed k m\Downloads\project catalyst\frontend"

:: Start frontend dev server (runs in background)
start "Frontend" npx vite --host --port 5173
echo Frontend starting on http://localhost:5173

echo.
echo ======================================
echo Inzora Terra OS is now running!
echo ======================================
echo.
echo Backend API:  http://127.0.0.1:8000
echo Frontend UI:  http://localhost:5173
echo.
echo Press Ctrl+C to terminate servers...
echo.

:: Wait indefinitely
:wait
timeout /t 10 /nobreak >nul
goto wait