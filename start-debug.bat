@echo off
echo ====================================
echo Starting SFU Backend (Debug Mode)
echo ====================================
echo.

echo Current directory: %CD%
echo Node version:
node --version
echo.

echo Environment variables:
echo NODE_ENV: %NODE_ENV%
echo PORT: %PORT%
echo.

echo Starting server...
npm run dev

pause

