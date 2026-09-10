[CmdletBinding()]
param(
    [switch]$SkipPortCheck
)

$ErrorActionPreference = 'Stop'

$RecoveryRoot = 'D:\recovery'
$NodeExe = 'C:\Users\tiao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$Services = @(
    @{
        Name = 'live-server'
        Port = 3000
        Directory = Join-Path $RecoveryRoot 'live-server'
        Entry = Join-Path $RecoveryRoot 'live-server\node_modules\tsx\dist\cli.mjs'
        Arguments = @('watch', 'src/index.ts')
        Log = Join-Path $RecoveryRoot 'logs\recovery-live-server.log'
        ErrorLog = Join-Path $RecoveryRoot 'logs\recovery-live-server.error.log'
    },
    @{
        Name = 'gantt'
        Port = 5566
        Directory = Join-Path $RecoveryRoot 'gantt'
        Entry = Join-Path $RecoveryRoot 'gantt\node_modules\vite\bin\vite.js'
        Arguments = @()
        Log = Join-Path $RecoveryRoot 'logs\recovery-gantt.log'
        ErrorLog = Join-Path $RecoveryRoot 'logs\recovery-gantt.error.log'
    }
)

function Assert-PathExists([string]$Path, [string]$Description) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Description was not found: $Path"
    }
}

function Get-ListeningProcessIds([int]$Port) {
    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

function Stop-PortOwner([int]$Port) {
    $processIds = Get-ListeningProcessIds $Port
    foreach ($processId in $processIds) {
        try {
            Stop-Process -Id ([int]$processId) -Force -ErrorAction Stop
            Write-Host "Stopped process $processId on port $Port"
        } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
            Write-Warning "Could not stop process $processId on port ${Port}: $($_.Exception.Message)"
        }
    }
}

# Database/Redis initialization can take longer than the old 15-second window.
# Keep the restart operation deterministic by allowing a normal cold start to
# finish before declaring the service unavailable.
function Wait-PortState([int]$Port, [bool]$Listening, [int]$TimeoutSeconds = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $isListening = $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        if ($isListening -eq $Listening) {
            return
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    $expected = if ($Listening) { 'listening' } else { 'stopped' }
    throw "Timed out waiting for port $Port to become $expected"
}

Assert-PathExists $NodeExe 'Node executable'
Assert-PathExists $RecoveryRoot 'Recovery root'
foreach ($service in $Services) {
    Assert-PathExists $service.Directory "$($service.Name) directory"
    Assert-PathExists $service.Entry "$($service.Name) entrypoint"
}

$logDirectory = Join-Path $RecoveryRoot 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

Write-Host 'Stopping Recovery services...'
foreach ($service in $Services) {
    Stop-PortOwner $service.Port
}

if (-not $SkipPortCheck) {
    foreach ($service in $Services) {
        Wait-PortState $service.Port $false
    }
}

Write-Host 'Starting live-server on port 3000...'
$liveServer = $Services[0]
Start-Process -FilePath $NodeExe `
    -ArgumentList (@($liveServer.Entry) + $liveServer.Arguments) `
    -WorkingDirectory $liveServer.Directory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $liveServer.Log `
    -RedirectStandardError $liveServer.ErrorLog | Out-Null

Write-Host 'Starting gantt on port 5566...'
$gantt = $Services[1]
Start-Process -FilePath $NodeExe `
    -ArgumentList (@($gantt.Entry) + $gantt.Arguments) `
    -WorkingDirectory $gantt.Directory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $gantt.Log `
    -RedirectStandardError $gantt.ErrorLog | Out-Null

if (-not $SkipPortCheck) {
    foreach ($service in $Services) {
        Wait-PortState $service.Port $true
        Write-Host "$($service.Name) is listening on port $($service.Port)"
    }
}

Write-Host 'Recovery services started.'
Write-Host 'Web: http://localhost:5566/altair/'
Write-Host 'Backend health: http://localhost:3000/health'
Write-Host "Logs: $logDirectory"
