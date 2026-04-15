$F = "reports/audit.txt"

if (-not (Test-Path $F)) {
    Write-Output "FAIL: missing audit.txt"
    exit 1
}

$content = Get-Content $F -Raw

if ($content -match "UNSAFE") {
    Write-Output "FAIL: unsafe"
    exit 1
}

if ($content -notmatch "Count:\s*1") {
    Write-Output "FAIL: writer count"
    exit 1
}

if ($content -notmatch "SAFE") {
    Write-Output "FAIL: no safe"
    exit 1
}

Write-Output "AUDIT PASS"
