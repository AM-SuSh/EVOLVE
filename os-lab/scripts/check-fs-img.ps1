# Verify fs.img exists and meets minimum size after lab6 kernel build.
param(
    [string]$ImgPath = "target/riscv64gc-unknown-none-elf/release/fs.img",
    [int]$MinBlocks = 131072,
    [int]$BlockSize = 512
)

$ErrorActionPreference = "Stop"
$minBytes = $MinBlocks * $BlockSize

if (-not (Test-Path -LiteralPath $ImgPath)) {
    Write-Error "fs.img not found: $ImgPath (run: cargo build -p kernel --features lab6 --release)"
    exit 1
}

$size = (Get-Item -LiteralPath $ImgPath).Length
if ($size -lt $minBytes) {
    Write-Error "fs.img too small: $size bytes (expected >= $minBytes)"
    exit 1
}

Write-Host "fs.img OK: $ImgPath ($size bytes)"
