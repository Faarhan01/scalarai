$env:PYTHONIOENCODING = "utf-8"
Set-Location "C:\Users\faarh\Workspaces\trader\pkg\mt5\tools\charts\tools"

Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

$out = & python mt5test.py --expert 'Experts\Bots\StrategyForge' --symbol 'Step Index' `
  --period M1 --days 30 --model real-ticks `
  --input InpSpreadOverridePts=1 --input InpFamily=FAM_SCALP_LEG `
  --input InpMinEV=-99 --input InpTag=SEARCH-OPEN 2>&1 | Out-String

Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

$tr = ([regex]::Match($out,'total_trades\s+(\d+)')).Groups[1].Value
$pr = ([regex]::Match($out,'total_net_profit\s+(-?[\d.]+)')).Groups[1].Value
$po = ([regex]::Match($out,'expected_payoff\s+(-?[\d.]+)')).Groups[1].Value
Write-Host ("  MinEV=-99 (gate wide open): trades={0}  profit={1}  per-trade={2}" -f $tr,$pr,$po)

$d = "$env:APPDATA\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075"
$c = Get-Content "$d\Tester\logs\20261019.log" -Encoding Unicode -Raw
$all = ($c -split "`r?`n") | Where-Object { $_ -match 'opportunity search|SEARCH' }
Write-Host ""
Write-Host "=== the search's own summary ==="
$all | Where-Object { $_ -match 'SEARCH' } | Select-Object -Last 1 |
  ForEach-Object { "  " + (($_ -replace '^[^\t]*\t[^\t]*\t[^\t]*\t[^\t]*\t','').Trim()) }
Write-Host ""
Write-Host "=== candidate count and the range of EVs it evaluated ==="
Write-Host "  decline messages: $(($all | Where-Object {$_ -match 'opportunity search'}).Count)"
$evs = $all | ForEach-Object { if ($_ -match 'EV (-?[\d.]+)') { [double]$Matches[1] } }
if ($evs) {
  $se = $evs | Sort-Object
  Write-Host ("  EV values: min {0}  max {1}  distinct {2}" -f $se[0], $se[-1], ($se | Select-Object -Unique).Count)
}
