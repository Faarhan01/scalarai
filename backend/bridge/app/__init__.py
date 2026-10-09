"""
Site integration layer for the MT5 bridge.

Isolates the actual MT5 bridge (../mt5/) from the ScalarAI site. Provides:
  - integration.py: converts site trade requests into bridge calls and back.
  - server.py: HTTP wrapper so the site talks to the bridge over HTTP.
  - client.py: lets the bridge talk *to* the site (active symbol, settings,
    trade confirmations).

The bridge never imports the site, and the site never imports the bridge --
they only communicate through these wrappers.
"""