$ErrorActionPreference = "Stop"

# Activate the OS experiment environment for the current PowerShell session.
# Dot-source it from the repo root:
#   . .\scripts\activate-os-env.ps1
#
# Paths are parameterized: defaults below match the original author machine;
# override them per-machine with a sibling `activate-os-env.local.ps1`
# (already gitignored) that sets $CargoHome / $QemuDir / $GitUsrBin,
# or pass -CargoHome etc. when dot-sourcing is not needed.

param(
    [string]$CargoHome = "D:\AppGallery\Rust\cargo",
    [string]$RustupHome = "D:\AppGallery\Rust\rustup",
    [string]$QemuDir = "D:\AppGallery\QEMU",
    [string]$GitUsrBin = "D:\Hit下载\Git\usr\bin"
)

$localOverride = Join-Path $PSScriptRoot "activate-os-env.local.ps1"
if (Test-Path $localOverride) {
    . $localOverride
}

$env:CARGO_HOME = $CargoHome
$env:RUSTUP_HOME = $RustupHome

$paths = @(
    (Join-Path $CargoHome "bin"),
    $QemuDir,
    $GitUsrBin
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $paths) {
    Write-Warning "No tool paths found. Create scripts/activate-os-env.local.ps1 with your own CargoHome/QemuDir/GitUsrBin."
}

$existing = $env:Path -split ";" | Where-Object { $_ -and ($_ -notin $paths) }
$env:Path = ($paths + $existing) -join ";"

Write-Host "OS experiment environment activated."
Write-Host "CARGO_HOME=$env:CARGO_HOME"
Write-Host "RUSTUP_HOME=$env:RUSTUP_HOME"
Write-Host "Note: MSVC build tools are located by rustc automatically; they do not need to be on PATH."
