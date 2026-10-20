$env:PYTHONIOENCODING="utf-8"
Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 4
Set-Location "C:\Users\faarh\Workspaces\trader\pkg\mt5\tools\charts\tools"

$common = @(
  '--expert', 'Experts\Bots\StrategyForge',
  '--symbol', 'Step Index',
  '--period', 'M1',
  '--days', '90',
  '--model', 'real-ticks',
  '--input', 'InpSpreadOverridePts=1',
  '--input', 'InpRequireEdgeOverCost=false'
)

Write-Host "########## FAM_SCALP_FADE ##########"
& python mt5test.py @common --input 'InpFamily=FAM_SCALP_FADE' --input 'InpTag=M1-FADE' 2>&1 |
  Select-String -Pattern 'total_trades|total_net_profit|expected_payoff|profit_factor|short_trades|long_trades' |
  ForEach-Object { "  " + $_.ToString().Trim() }

Write-Host ""
Write-Host "########## FAM_NULL control ##########"
& python mt5test.py @common --input 'InpFamily=FAM_NULL' --input 'InpNullSeed=808' --input 'InpTag=M1-NULL' 2>&1 |
  Select-String -Pattern 'total_trades|total_net_profit|expected_payoff|profit_factor|short_trades|long_trades' |
  ForEach-Object { "  " + $_.ToString().Trim() }
