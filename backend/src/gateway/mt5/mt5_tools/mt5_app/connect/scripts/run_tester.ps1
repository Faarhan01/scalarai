# Native MT5 Strategy Tester runner for StrategyForge.
#
# Launches terminal64.exe with a [Tester] block, shows the Strategy Tester
# pane (Visual=1), waits for the run, and prints the numbers from MT5's own
# report. Nothing is recomputed and no statistics are re-derived here.
#
#   .\run_tester.ps1 -Family FAM_ASYM -Period M15 -Days 90
param(
  [string]$Family  = 'FAM_ASYM',
  [string]$Symbol  = 'Step Index',
  [string]$Period  = 'M15',
  [int]$Days       = 90,
  [string]$From    = '',
  [string]$To      = '',
  [string]$Model   = 'real-ticks',
  [int]$Seed      = 0
)

$ErrorActionPreference = 'Stop'
Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

$tools = 'C:\Users\faarh\Workspaces\trader\pkg\mt5\tools\charts\tools'
Set-Location $tools

$a = @('mt5test.py',
       '--expert', 'Experts\Bots\StrategyForge',
       '--symbol', $Symbol,
       '--period', $Period,
       '--days',   "$Days",
       '--model',  $Model,
       '--input',  "InpFamily=$Family")

if ($From -ne '') { $a += @('--from', $From) }
if ($To   -ne '') { $a += @('--to',   $To) }
if ($Seed -ne 0)  { $a += @('--input', "InpNullSeed=$Seed") }

Write-Host "  running: $($a -join ' ')"
& python @a
