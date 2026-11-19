@echo off
chcp 65001 >nul
REM Tunisia Golden League - Copie les sauvegardes de la base du serveur vers ce PC (dossier sauvegardes)
REM Lance automatiquement chaque jour par sauvegarde-auto.bat ; garde 60 jours de sauvegardes sur ce PC.
cd /d "%~dp0"
for /f "usebackq tokens=1,2 delims=;" %%a in ("deploy\serveur.txt") do (set IP=%%a& set SSHUSER=%%b)
if not exist sauvegardes mkdir sauvegardes
scp -i "%USERPROFILE%\.ssh\tgl_vps" -o BatchMode=yes "%SSHUSER%@%IP%:/opt/tgl/deploy/backups/*.sql.gz" sauvegardes\ >> sauvegardes\journal.txt 2>&1
if errorlevel 1 (echo %date% %time% ECHEC >> sauvegardes\journal.txt) else (echo %date% %time% OK >> sauvegardes\journal.txt)
forfiles /p sauvegardes /m *.sql.gz /d -60 /c "cmd /c del @path" >nul 2>&1
if /i not "%1"=="auto" pause
