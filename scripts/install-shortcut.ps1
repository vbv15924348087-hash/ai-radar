[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $PSScriptRoot 'launch-radar.ps1'
$desktopDirectory = [Environment]::GetFolderPath('DesktopDirectory')
if (-not $desktopDirectory) { throw '无法确定当前用户的桌面目录。' }
$shortcutPath = Join-Path $desktopDirectory 'AI Radar.lnk'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shell = New-Object -ComObject WScript.Shell
try {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.Arguments -notlike ('*' + $launcher + '*')) {
        throw "桌面已有其他同名快捷方式，已保留原文件：$shortcutPath"
    }
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $launcher
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.Description = '启动 AI Radar，并使用默认浏览器打开本地情报工作台'
    $shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',14'
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    Write-Output "已创建桌面快捷方式：$shortcutPath"
} finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
