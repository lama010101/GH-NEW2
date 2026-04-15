param(
    [string]$Task
)

if (-not $Task) {
    Write-Output "Usage: run_task.ps1 <task-file>"
    exit 1
}

if (-not (Test-Path $Task)) {
    Write-Output "Task not found: $Task"
    exit 1
}

if (-not (Test-Path "reports/implementation.txt")) {
    Write-Output "Missing implementation.txt"
    exit 1
}

if (-not (Test-Path "reports/audit.txt")) {
    Write-Output "Missing audit.txt"
    exit 1
}

powershell -ExecutionPolicy Bypass -File scripts/validate.ps1
if ($LASTEXITCODE -ne 0) {
    Move-Item $Task tasks/failed/
    exit 1
}

powershell -ExecutionPolicy Bypass -File scripts/audit.ps1
if ($LASTEXITCODE -ne 0) {
    Move-Item $Task tasks/failed/
    exit 1
}

Move-Item $Task tasks/done/
Write-Output "PASS"
