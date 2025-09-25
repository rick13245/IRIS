# Creates a Desktop shortcut to the ITMS starter script
$ErrorActionPreference = 'Stop'

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'ITMS Cockpit.lnk'
$target = Join-Path $PSScriptRoot 'start-itms.cmd'
$workDir = $PSScriptRoot
$iconPath = Join-Path $PSScriptRoot 'Indian_Railways_Logo_Red_Variant.png'

$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = $target
$sc.WorkingDirectory = $workDir
$sc.WindowStyle = 1  # Normal window
$sc.Arguments = ""  # Ensure no arguments are passed
if (Test-Path $iconPath) {
    $sc.IconLocation = $iconPath
}
$sc.Description = 'Start ITMS: services + app'
$sc.Save()

Write-Host "Created shortcut: $shortcutPath"
Write-Host "Target: $target"
Write-Host "Working Directory: $workDir"
