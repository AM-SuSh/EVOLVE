$ErrorActionPreference = "Stop"

# Activate the OS experiment environment for the current PowerShell session.
# Dot-source it from the repo root:
#   . .\scripts\activate-os-env.ps1

$env:CARGO_HOME = "D:\AppGallery\Rust\cargo"
$env:RUSTUP_HOME = "D:\AppGallery\Rust\rustup"

$paths = @(
    "D:\AppGallery\Rust\cargo\bin",
    "D:\AppGallery\QEMU",
    "D:\Hit下载\Git\usr\bin"
)

$existing = $env:Path -split ";" | Where-Object { $_ -and ($_ -notin $paths) }
$env:Path = ($paths + $existing) -join ";"

Write-Host "OS experiment environment activated."
Write-Host "CARGO_HOME=$env:CARGO_HOME"
Write-Host "RUSTUP_HOME=$env:RUSTUP_HOME"
Write-Host "Note: MSVC build tools (D:\AppGallery\BuildTools) are located by rustc"
Write-Host "      automatically; they do not need to be on PATH."
