$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$library = Join-Path $root 'LibMarlinNexusOwnership.js'
$startup = Join-Path $root 'BASLA-addition.js'
$test = Join-Path $root 'test-macro.cjs'

foreach ($path in @($library, $startup, $test)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing file: $path"
    }
}

$libraryText = Get-Content -LiteralPath $library -Raw
$startupText = Get-Content -LiteralPath $startup -Raw

$forbiddenPatterns = @(
    '\bExecSql\b',
    '\bOpenCommandText\b',
    '\bCommandText\b',
    '\bDataObject\.CommandTable\b',
    '\bUPDATE\s+',
    '\bINSERT\s+INTO\b',
    '\bDELETE\s+FROM\b'
)

foreach ($pattern in $forbiddenPatterns) {
    if ($libraryText -match $pattern -or $startupText -match $pattern) {
        throw "Forbidden direct-SQL pattern found: $pattern"
    }
}

$eventNames = [regex]::Matches($startupText, 'SetEvent\(Scripter,\s*"[^"]+",\s*"([^"]+)"') |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Unique

foreach ($eventName in $eventNames) {
    if ($libraryText -notmatch ('function\s+' + [regex]::Escape($eventName) + '\s*\(')) {
        throw "Event handler is not defined in the library: $eventName"
    }
}

$syntaxCheck = @'
const fs = require("fs");
for (const file of process.argv.slice(1)) {
  new Function(fs.readFileSync(file, "utf8"));
}
'@

& node -e $syntaxCheck $library $startup
if ($LASTEXITCODE -ne 0) { throw 'CPM macro syntax check failed.' }

& node $test
if ($LASTEXITCODE -ne 0) { throw 'Macro behavior tests failed.' }

Write-Output 'Static safety checks passed.'
Write-Output ('Validated event handlers: ' + ($eventNames -join ', '))
