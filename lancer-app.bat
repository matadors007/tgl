@echo off
chcp 65001 >nul
REM Lance l'application : scanne le QR code avec Expo Go (Android / iPhone).
REM Le telephone et le PC doivent etre sur le meme Wi-Fi.
cd /d "%~dp0"
if not exist "node_modules" call npm install
call npx expo start --clear
pause
