$env:PYTHONIOENCODING = "utf-8"
Set-Location "C:\Users\faarh\Workspaces\trader\pkg\mt5\tools\charts\tools"

function Run-Test($tag, $extra) {
  Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 3
  $a = @('mt5test.py','--expert','Experts\Bots\StrategyForge','--symbol','Step Index',
         '--period','M1','--days','90','--model','real-ticks',
         '--input','InpSpreadOverridePts=1') + $extra + @('--input',"InpTag=$tag")
  $o = & python @a 2>&1 | Out-String
  $tr = ([regex]::Match($o,'total_trades\s+(\d+)')).Groups[1].Value
  $pr = ([regex]::Match($o,'total_net_profit\s+(-?[\d.]+)')).Groups[1].Value
  $pf = ([regex]::Match($o,'profit_factor\s+(-?[\d.]+)')).Groups[1].Value
  Write-Host ("  {0,-12} trades={1,-7} profit={2,-10} pf={3}" -f $tag,$tr,$pr,$pf)
}

# No InpRequireEdgeOverCost, no InpMinEV. Gates are gone from the source.
Run-Test 'NOGATE-LEG'  @('--input','InpFamily=FAM_SCALP_LEG')
Run-Test 'NOGATE-FADE' @('--input','InpFamily=FAM_SCALP_FADE')
Run-Test 'NOGATE-NULL' @('--input','InpFamily=FAM_NULL','--input','InpNullSeed=808')

Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$d = "$env:APPDATA\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075"
$c = Get-Content "$d\Tester\logs\20261019.log" -Encoding Unicode -Raw
$strip = { param($s) ($s -replace '^[^\t]*\t[^\t]*\t[^\t]*\t[^\t]*\t','').Trim() }
Write-Host ""
Write-Host "=== the EA's own accounting ==="
($c -split "`r?`n") | Where-Object { $_ -match '\[SF\] (SEARCH|GATES|VERDICT)' } |
  Select-Object -Last 9 | ForEach-Object { "  " + (& $strip $_) }
