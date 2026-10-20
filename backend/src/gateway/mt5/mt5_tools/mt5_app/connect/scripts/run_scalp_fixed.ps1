$env:PYTHONIOENCODING = "utf-8"
Get-Process terminal64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 4
Set-Location "C:\Users\faarh\Workspaces\trader\pkg\mt5\tools\charts\tools"

$common = @(
  '--expert', 'Experts\Bots\StrategyForge',
  '--symbol',  'Step Index',
  '--period',  'M1',
  '--days',    '90',
  '--model',   'real-ticks',
  '--input',   'InpSpreadOverridePts=1',
  '--input',   'InpRequireEdgeOverCost=false'
)

$runs = @(
  @{ tag = 'FIX-LEG';        extra = @('--input','InpFamily=FAM_SCALP_LEG') },
  @{ tag = 'FIX-LEG-GATED';  extra = @('--input','InpFamily=FAM_SCALP_LEG','--input','InpScalpMinStrength=1.0') },
  @{ tag = 'FIX-FADE';       extra = @('--input','InpFamily=FAM_SCALP_FADE') },
  @{ tag = 'FIX-NULL';       extra = @('--input','InpFamily=FAM_NULL','--input','InpNullSeed=808') }
)

foreach ($r in $runs) {
  $args = $common + $r.extra + @('--input', "InpTag=$($r.tag)")
  $out = & python mt5test.py @args 2>&1 | Out-String
  $tr = ([regex]::Match($out, 'total_trades\s+(\d+)')).Groups[1].Value
  $pr = ([regex]::Match($out, 'total_net_profit\s+(-?[\d.]+)')).Groups[1].Value
  $pf = ([regex]::Match($out, 'profit_factor\s+(-?[\d.]+)')).Groups[1].Value
  $po = ([regex]::Match($out, 'expected_payoff\s+(-?[\d.]+)')).Groups[1].Value
  Write-Host ("  {0,-14} trades={1,-6} profit={2,-10} pf={3,-6} payoff={4}" -f $r.tag, $tr, $pr, $pf, $po)
}
