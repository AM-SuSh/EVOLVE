$ErrorActionPreference = "Stop"

$env:CARGO_HOME = "D:\AppGallery\Rust\cargo"
$env:RUSTUP_HOME = "D:\AppGallery\Rust\rustup"

$paths = @(
    "D:\AppGallery\Rust\cargo\bin",
    "D:\AppGallery\QEMU",
    "D:\AppGallery\Git\bin",
    "D:\AppGallery\Git\cmd"
)

$existing = $env:Path -split ";" | Where-Object { $_ -and ($_ -notin $paths) }
$env:Path = ($paths + $existing) -join ";"

Write-Host "OS experiment environment activated."
Write-Host "CARGO_HOME=$env:CARGO_HOME"
Write-Host "RUSTUP_HOME=$env:RUSTUP_HOME"
