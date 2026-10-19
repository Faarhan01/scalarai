"""Tools that talk directly to an MT5 application.

  MetaEditor64.exe  compiling
  terminal64.exe    Strategy Tester, /config, EA install
  MetaTrader5 pkg   IPC to a running terminal

Also the readers of MT5's own output -- Tester\cache\*.tst, *.opt
and Tester\logs\*.log -- because those files are produced by those two
applications and nothing else can create them.

strategyforge.py stays one level up in tools/ as the primary entry point.
"""
