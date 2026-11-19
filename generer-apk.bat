@echo off
chcp 65001 >nul
setlocal
REM ============================================================
REM  Tunisia Golden League - Genere l'APK Android EN LOCAL, directement dans ce dossier
REM  Resultat : TunisiaGoldenLeague.apk a cote de ce fichier.
REM  Prerequis : Node.js + Android Studio (SDK Android installe).
REM ============================================================
cd /d "%~dp0"

REM --- SDK Android ---
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platform-tools" (
  echo [ERREUR] SDK Android introuvable dans "%ANDROID_HOME%".
  echo Ouvre Android Studio ^> More Actions ^> SDK Manager et installe le SDK, puis relance.
  goto :error
)

REM --- Java (JDK 17 ou plus) : recherche automatique ---
REM Pour forcer un JDK precis, decommente et adapte la ligne suivante :
REM set "JAVA_HOME=C:\chemin\vers\jdk-17"
if defined JAVA_HOME if not exist "%JAVA_HOME%\bin\java.exe" set "JAVA_HOME="
for %%D in (
  "%ProgramFiles%\Android\Android Studio\jbr"
  "%ProgramFiles%\Android\Android Studio1\jbr"
  "%LOCALAPPDATA%\Programs\Android Studio\jbr"
  "%ProgramFiles%\Android\Android Studio Preview\jbr"
  "%ProgramFiles%\Android\Android Studio\jre"
) do if not defined JAVA_HOME if exist "%%~D\bin\java.exe" set "JAVA_HOME=%%~D"
for /d %%D in (
  "%USERPROFILE%\.jdks\*17*" "%USERPROFILE%\.jdks\*21*" "%USERPROFILE%\.jdks\*23*" "%USERPROFILE%\.jdks\*24*" "%USERPROFILE%\.jdks\*25*"
  "%ProgramFiles%\Java\jdk-17*" "%ProgramFiles%\Java\jdk-21*" "%ProgramFiles%\Java\jdk-2*"
  "%ProgramFiles%\Eclipse Adoptium\jdk-17*" "%ProgramFiles%\Eclipse Adoptium\jdk-21*"
  "%ProgramFiles%\Microsoft\jdk-17*" "%ProgramFiles%\Microsoft\jdk-21*"
  "%ProgramFiles%\Zulu\zulu-17*" "%ProgramFiles%\Zulu\zulu-21*"
) do if not defined JAVA_HOME if exist "%%~D\bin\java.exe" set "JAVA_HOME=%%~D"
if not defined JAVA_HOME (
  for /f "delims=" %%J in ('where java 2^>nul') do if not defined JAVA_HOME set "JAVA_BIN=%%~dpJ"
)
if not defined JAVA_HOME if defined JAVA_BIN for %%P in ("%JAVA_BIN%..") do set "JAVA_HOME=%%~fP"
if not defined JAVA_HOME (
  echo [ERREUR] Aucun JDK 17+ trouve sur ce PC.
  echo Installe le JDK 17 ^(gratuit^) : https://learn.microsoft.com/java/openjdk/download#openjdk-17
  echo puis relance ce fichier.
  goto :error
)
echo Java utilise : %JAVA_HOME%
"%JAVA_HOME%\bin\java.exe" -version
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo.
echo [1/4] Installation des dependances (npm install)...
call npm install || goto :error

echo.
echo [2/4] Generation du projet Android (expo prebuild)...
call npx expo prebuild --platform android --clean --no-install || goto :error

echo.
echo [3/4] Compilation de l'APK (10 a 20 min la premiere fois)...
cd android
call gradlew.bat assembleRelease || goto :error
cd ..

echo.
echo [4/4] Copie de l'APK dans ce dossier...
copy /Y "android\app\build\outputs\apk\release\app-release.apk" "TunisiaGoldenLeague.apk" >nul || goto :error

echo.
echo ============================================================
echo  Termine ! L'APK est ici : %CD%\TunisiaGoldenLeague.apk
echo  Copie-le sur ton telephone Android et ouvre-le pour l'installer
echo  (autorise "sources inconnues" si Android le demande).
echo ============================================================
pause
exit /b 0

:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
