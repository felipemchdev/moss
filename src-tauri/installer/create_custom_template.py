import os
import re

base_dir = os.path.dirname(os.path.abspath(__file__))
tauri_dir = os.path.dirname(base_dir)
src_path = os.path.join(tauri_dir, 'target', 'release', 'nsis', 'x64', 'installer.nsi')
dst_path = os.path.join(base_dir, 'custom_installer.nsi')

with open(src_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Lowercase product name and add flexible relative includedirs
content = content.replace('!define PRODUCTNAME "Moss"', '!define PRODUCTNAME "moss"')
content = content.replace(
    '!include MUI2.nsh',
    '!addincludedir "installer"\n!addincludedir "."\n!addincludedir ".."\n!include MUI2.nsh'
)

# 2. Add relative branding assets and binaries
branding_overrides = """
!define UNINSTALLERICON ""
!define UNINSTALLERHEADERIMAGE ""

!define MOSS_SRC_DIR "${__FILEDIR__}\\..\\..\\..\\.."
!define INSTALLERICON "${MOSS_SRC_DIR}\\icons\\icon.ico"
!define SIDEBARIMAGE "${MOSS_SRC_DIR}\\installer\\sidebar.bmp"
!define HEADERIMAGE "${MOSS_SRC_DIR}\\installer\\header.bmp"
!define MAINBINARYSRCPATH "${MOSS_SRC_DIR}\\target\\release\\moss.exe"
!define ADDITIONALPLUGINSPATH "${MOSS_SRC_DIR}\\installer"

!define MAINBINARYNAME "moss"
!define BUNDLEID "dev.moss.browser"
!define COPYRIGHT ""
!ifndef OUTFILE
  !define OUTFILE "nsis-output.exe"
!endif
!define ARCH "x64"
"""

content = re.sub(
    r'!define INSTALLERICON "".*?!define ARCH "x64"',
    branding_overrides.strip(),
    content,
    flags=re.DOTALL
)

# Replace any lingering ADDITIONALPLUGINSPATH
content = re.sub(
    r'!define ADDITIONALPLUGINSPATH ".*?"',
    '; ADDITIONALPLUGINSPATH defined above',
    content
)

# 3. Add MUI colors before MUI_PAGE_WELCOME
mui_colors = """
; --- Moss Custom Modern UI 2 Theme ---
!define MUI_BGCOLOR "0F1411"
!define MUI_TEXTCOLOR "DCE2DE"
!define MUI_FINISHPAGE_LINK_COLOR "7DA27E"
"""

content = content.replace(
    '; 1. Welcome Page',
    mui_colors + '\n; 1. Welcome Page'
)

# 4. Skip Directory page for modern 1-click install
content = content.replace(
    '; 5. Choose install directory page\n!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive\n!insertmacro MUI_PAGE_DIRECTORY',
    '; 5. Choose install directory page (skipped for modern 1-click install into LocalAppData\\Programs\\moss)\n!define MUI_PAGE_CUSTOMFUNCTION_PRE Skip\n!insertmacro MUI_PAGE_DIRECTORY'
)

# 5. Finish page with Run moss checked by default and clean finish page
old_finish = """; 8. Finish page
;
; Don't auto jump to finish page after installation page,
; because the installation page has useful info that can be used debug any issues with the installer.
!define MUI_FINISHPAGE_NOAUTOCLOSE
; Use show readme button in the finish page as a button create a desktop shortcut
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "$(createDesktop)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateOrUpdateDesktopShortcut
; Show run app after installation.
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_FINISH"""

new_finish = """; 8. Finish page
;
; Don't auto jump to finish page after installation page,
; because the installation page has useful info that can be used debug any issues with the installer.
!define MUI_FINISHPAGE_NOAUTOCLOSE
; Show run app after installation (checked by default for seamless 1-click onboarding)
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_CHECKED
!define MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_FINISH"""

if old_finish in content:
    content = content.replace(old_finish, new_finish)
else:
    content = re.sub(
        r'!define MUI_FINISHPAGE_SHOWREADME.*?!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive\s*!insertmacro MUI_PAGE_FINISH',
        '!define MUI_FINISHPAGE_RUN\n!define MUI_FINISHPAGE_RUN_CHECKED\n!define MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary\n!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive\n!insertmacro MUI_PAGE_FINISH',
        content,
        flags=re.DOTALL
    )

# 6. Change install location for currentUser to $LOCALAPPDATA\Programs\moss
content = content.replace(
    'StrCpy $INSTDIR "$LOCALAPPDATA\\${PRODUCTNAME}"',
    'StrCpy $INSTDIR "$LOCALAPPDATA\\Programs\\moss"'
)

# 7. Unconditionally create desktop shortcut in Section Install
old_shortcuts = """  ; Create start menu shortcut
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateOrUpdateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Create desktop shortcut for silent and passive installers
  ; because finish page will be skipped
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}"""

new_shortcuts = """  ; Create start menu shortcut
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateOrUpdateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Create desktop shortcut automatically for all installations
  Call CreateOrUpdateDesktopShortcut"""

if old_shortcuts in content:
    content = content.replace(old_shortcuts, new_shortcuts)

# 8. English.nsh include relative/portable and OUTFILE ifndef
content = content.replace(
    '!define OUTFILE "nsis-output.exe"',
    '!ifndef OUTFILE\n  !define OUTFILE "nsis-output.exe"\n!endif'
)
content = re.sub(
    r'!include ".*?English\.nsh"',
    '!include "English.nsh"',
    content
)

with open(dst_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"custom_installer.nsi regenerated with relative paths at: {dst_path}")
