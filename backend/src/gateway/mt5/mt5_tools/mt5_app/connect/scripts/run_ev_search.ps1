$env:PYTHONIOENCODING = "utf-8"
Set-Location "C:\Users\faarh\Workspaces\trader\pkg\mt5\tools\charts\tools"

$runs = @(
  @{ tag = 'EV-LEG';   extra = @('--input','InpFamily=FAM_SCALP_LEG') },
  @{ tag = 'EV-FADE';  extra = @('--input','InpFamily=FAM_SCALP_FADE') }
)

foreach ($r in $runs) {
  Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 3
  $args = @('mt5test.py','--expert','Experts\Bots\StrategyForge','--symbol','Step Index',
            '--period','M1','--days','90','--model','real-ticks',
            '--input','InpSpreadOverridePts=1') + $r.extra + @('--input',"InpTag=$($r.tag)")
  $out = & python @args 2>&1 | Out-String
  $tr = ([regex]::Match($out, 'total_trades\s+(\d+)')).Groups[1].Value
  $pr = ([regex]::Match($out, 'total_net_profit\s+(-?[\d.]+)')).Groups[1].Value
  Write-Host ("  {0,-10} trades={1,-8} profit={2}" -f $r.tag, $tr, $pr)
  if (-not $tr) { Write-Host "     (no report produced)" }
}

Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# the SEARCH line is the whole point of this pass
$d = "$env:APPDATA\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075"
$c = Get-Content "$d\Tester\logs\20261019.log" -Encoding Unicode -Raw
Write-Host ""
Write-Host "=== what the opportunity search concluded ==="
($c -split "`r?`n") | Where-Object { $_ -match '\[SF\] SEARCH|opportunity search' } |
  Select-Object -Last 4 | ForEach-Object { "  " + (($_ -replace '^[^\t]*\t[^\t]*\t[^\t]*\t[^\t]*\t','').Trim()) }
