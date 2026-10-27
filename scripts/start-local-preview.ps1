param(
  [int]$Port = 3212
)

$ErrorActionPreference = "Stop"
$previewRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$previewResults = Join-Path $previewRoot "test-results"
$previewNode = (Get-Command node.exe).Source
$previewStdout = Join-Path $previewResults "preview-$Port.out.log"
$previewStderr = Join-Path $previewResults "preview-$Port.err.log"

New-Item -ItemType Directory -Force -Path $previewResults | Out-Null

$existingListener = netstat -ano | Select-String ":$Port\s+.*LISTENING"
if ($existingListener) {
  throw "Port $Port is already in use. Stop the existing preview explicitly before starting another one."
}

$previewArguments = @(
  "node_modules\next\dist\bin\next",
  "start",
  "--hostname",
  "127.0.0.1",
  "--port",
  "$Port"
)

$previewProcess = Start-Process `
  -FilePath $previewNode `
  -ArgumentList $previewArguments `
  -WorkingDirectory $previewRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $previewStdout `
  -RedirectStandardError $previewStderr `
  -PassThru

Start-Sleep -Seconds 2
if ($previewProcess.HasExited) {
  throw "Preview process exited with code $($previewProcess.ExitCode). See $previewStderr."
}

$previewHealth = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 10
[pscustomobject]@{
  Pid = $previewProcess.Id
  Status = $previewHealth.StatusCode
  Url = "http://127.0.0.1:$Port"
  Stdout = $previewStdout
  Stderr = $previewStderr
}
