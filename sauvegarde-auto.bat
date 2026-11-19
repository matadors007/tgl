@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Copie automatique des sauvegardes sur ce PC, chaque jour a 13:00
REM  (si le PC est allume). Prerequis : securiser-ssh.bat (connexion par cle).
REM ============================================================
cd /d "%~dp0"
if not exist "%USERPROFILE%\.ssh\tgl_vps" (
  echo [ERREUR] Lancez d'abord securiser-ssh.bat
  pause
  exit /b 1
)
schtasks /Create /F /SC DAILY /ST 13:00 /TN "TGL - sauvegardes" /TR "\"%~dp0telecharger-sauvegardes.bat\" auto" || goto :error
echo.
echo Premiere copie maintenant...
call "%~dp0telecharger-sauvegardes.bat" auto
type sauvegardes\journal.txt
echo.
echo Termine : chaque jour a 13:00, les sauvegardes du serveur sont copiees dans le dossier "sauvegardes".
echo (Pour arreter : Planificateur de taches Windows ^> "TGL - sauvegardes" ^> Supprimer.)
pause
exit /b 0
:error
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
