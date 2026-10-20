"""Why is there no tick data for Step Index 200, and what can we use instead?"""
from datetime import datetime, timedelta, timezone

import MetaTrader5 as mt5

mt5.initialize()
ai = mt5.account_info()
print("account   :", ai.login, ai.name, "| server:", ai.server)
print("connected :", mt5.terminal_info().connected)

S = "Step Index 200"
mt5.symbol_select(S, True)
i = mt5.symbol_info(S)
print(f"symbol    : visible={i.visible} trade_mode={i.trade_mode} "
      f"spread={i.spread} volume={i.volume} session_deals={i.session_deals}")

t = mt5.copy_ticks_from(S, mt5.TIMEFRAME_M1, 0, 200)
print("  copy_ticks_from_pos :", 0 if t is None else len(t), mt5.last_error())

utc = lambda x: x.replace(tzinfo=timezone.utc)
r = mt5.copy_rates_range(S, mt5.TIMEFRAME_M1, utc(datetime.utcnow() - timedelta(hours=6)),
                         utc(datetime.utcnow()))
print("  bars in last 6h    :", 0 if r is None else len(r))
if r is not None and len(r):
    print("  last bar            :", datetime.utcfromtimestamp(int(r[-1]["time"])))
    print("  spread field values :", sorted({int(x["spread"]) for x in r}))
    print("  tick_volume range   :", min(int(x["tick_volume"]) for x in r),
          "-", max(int(x["tick_volume"]) for x in r))
print("  now                 :", datetime.utcnow())
print()
print("  -> ticks unavailable locally; per-bar 'spread' and 'tick_volume' still")
print("     give the cost and activity picture.")
mt5.shutdown()