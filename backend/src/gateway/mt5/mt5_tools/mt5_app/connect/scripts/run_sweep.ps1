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
  Write-Host ("  {0,-14} trades={1,-8} profit={2}" -f $tag,$tr,$pr)
}

Run-Test 'SWEEP-LEG'  @('--input','InpFamily=FAM_SCALP_LEG')
Run-Test 'SWEEP-FADE' @('--input','InpFamily=FAM_SCALP_FADE')
Run-Test 'SWEEP-NULL' @('--input','InpFamily=FAM_NULL','--input','InpNullSeed=808')

Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$d = "$env:APPDATA\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075"
$c = Get-Content "$d\Tester\logs\20261019.log" -Encoding Unicode -Raw
Write-Host ""
Write-Host "=== what the search actually saw ==="
($c -split "`r?`n") | Where-Object { $_ -match '\[SF\] SEARCH|\[SF\] search:' } |
  Select-Object -Last 6 | ForEach-Object { "  " + (($_ -replace '^[^\t]*\t[^\t]*\t[^\t]*\t[^\t]*\t','').Trim()) }
