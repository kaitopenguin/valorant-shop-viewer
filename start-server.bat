@echo off
title VALORANT Shop Viewer - Server
echo ========================================
echo   VALORANT SHOP VIEWER - STARTING...
echo ========================================

REM Kill any existing instance
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

REM Start Node.js server
echo [1/2] Starting Node.js server on port 3000...
start /B "" "C:\Users\Kaito\AppData\Roaming\Antigravity\bin\agy-node.cmd" "C:\Users\Kaito\.gemini\antigravity\scratch\valorant-shop-viewer\server.js"

REM Wait for server to be ready
timeout /t 5 /nobreak >nul

REM Start Cloudflare tunnel and log URL
echo [2/2] Starting Cloudflare tunnel...
"C:\Users\Kaito\.gemini\antigravity\scratch\cloudflared.exe" tunnel --url http://localhost:3000 2> "%USERPROFILE%\valorant-tunnel.log"
