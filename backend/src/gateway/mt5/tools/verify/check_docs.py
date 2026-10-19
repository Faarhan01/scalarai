"""Integrity check for the docs in Tools/MT5/docs.

Checks the mechanical things: valid UTF-8, balanced code fences, no U+FFFD,
section numbering in order. Then flags any command that looks like a shell
invocation so it can be eyeballed against reality.
"""
import re
import sys
from pathlib import Path

DOCS = Path(r"C:\Users\faarh\Workspaces\Tools\MT5\docs")

ok = True
for f in sorted(DOCS.glob("*.md")):
    raw = f.read_bytes()
    print(f"\n=== {f.name} ===")
    print(f"  bytes            : {len(raw)}")
    print(f"  lines            : {len(raw.decode('utf-8').splitlines())}")
    has_bom = raw[:3] == b"\xef\xbb\xbf"
    print(f"  BOM              : {has_bom}")

    try:
        t = raw.decode("utf-8")
        print("  decodes as utf-8 : OK")
    except UnicodeDecodeError as e:
        print(f"  decodes as utf-8 : FAIL {e}")
        ok = False
        continue

    bad = t.count("\ufffd")
    print(f"  U+FFFD           : {bad}")
    if bad:
        ok = False

    fences = t.count("```")
    print(f"  code fences      : {fences} ({'balanced' if fences % 2 == 0 else 'UNBALANCED'})")
    if fences % 2:
        ok = False

    nums = []
    for line in t.splitlines():
        m = re.match(r"^## (\d+)\.", line)
        if m:
            nums.append(int(m.group(1)))
    if nums:
        sequential = nums == list(range(1, len(nums) + 1))
        print(f"  numbered sections: {nums[:12]}{'...' if len(nums) > 12 else ''} "
              f"{'sequential' if sequential else 'OUT OF ORDER'}")
        if not sequential:
            ok = False

    claims = {
        "[verified]": t.count("[verified]"),
        "[docs]": t.count("[docs]"),
        "[unverified]": t.count("[unverified]"),
    }
    print(f"  claim labels     : {claims}")

    cmds = re.findall(r"^\s*(?:python |& \"|terminal64)", t, re.M)
    print(f"  shell commands   : {len(cmds)}")

print("\n" + ("ALL CHECKS PASSED" if ok else "PROBLEMS FOUND"))
sys.exit(0 if ok else 1)