$F = "reports/implementation.txt"

if (-not (Test-Path $F)) {
    Write-Output "FAIL: missing implementation.txt"
    exit 1
}

$content = Get-Content $F -Raw

if ($content -notmatch "grep -n .+:[0-9]+") {
    Write-Output "FAIL: no valid grep usage"
    exit 1
}

if ($content -notmatch "[a-zA-Z0-9._/-]+:[0-9]+") {
    Write-Output "FAIL: no file:line reference"
    exit 1
}

if ($content -match "(should|probably|seems|likely)") {
    Write-Output "FAIL: vague words"
    exit 1
}

if ($content -notmatch "@") {
    Write-Output "FAIL: no code reference block"
    exit 1
}

Write-Output "VALIDATE PASS"
