$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPortable = Get-ChildItem -Path (Join-Path $PSScriptRoot '.tools/node-*-win-x64') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($taskPortable) { $env:Path = $taskPortable.FullName + ';' + $env:Path }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 LTS or newer to run LoadFactor.' }
& npm.cmd run dev
exit $LASTEXITCODE