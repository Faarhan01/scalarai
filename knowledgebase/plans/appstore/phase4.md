# AppStore Standardization — Phase 4: Freeze in Development

## Objective

Add `Object.freeze(store)` in development to catch accidental mutations at runtime.

## Implementation

Add one line to `backend/src/index.ts` after creating the `AppStore` instance:

```ts
const store = new AppStore();

if (process.env.NODE_ENV !== "production") {
  Object.freeze(store);
}
```

## What This Catches (After Phase 1)

After Phase 1 makes all fields private, `Object.freeze(store)` catches:

1. **Accidental reassignment of the store reference:**
   ```ts
   store = new AppStore();  // TypeError: Cannot assign to read only property
   ```

2. **Accidental addition of new properties:**
   ```ts
   (store as any).newField = "value";  // TypeError in strict mode
   ```

## What This Does NOT Catch

1. **Shallow freeze only**: Nested objects/arrays are not frozen.
   - `store.config.lotSize = 999` would still work if `config` object is not frozen
   - This is fine — `updateSettings()` intentionally mutates `tradeConfig` properties

2. **Set/Map contents**: `Object.freeze()` only freezes the Set/Map reference, not its contents.
   - `store.mt5BridgeClients.add(ws)` would still work
   - This is fine — `addBridgeClient()` intentionally mutates the Set

3. **Internal mutations**: `Object.freeze()` does not catch mutations inside `AppStore` methods (which is intentional).

## When to Apply

- Apply AFTER Phase 1 (private fields) so TypeScript doesn't complain about `private` fields being frozen
- Apply AFTER Phase 2 (interface split) so you catch any missed mutations during the interface transition
- Do NOT apply before Phase 1 — it will fail because public fields can't be frozen if they're reassigned in the constructor

## Do NOT Deep-Freeze Mutable State

**Do NOT deep-freeze `tradeConfig`, `tradesList`, or other objects that need to be mutated.** These are intentionally mutable — `updateSettings()`, `placeTrade()`, `closeTrade()`, and `resetStats()` all modify them. Freezing them would break the app.

```ts
// WRONG — this breaks updateSettings()
constructor() {
  this.tradeConfig = Object.freeze(getDefaultTradeConfig());  // breaks app
}

// CORRECT — only freeze the store reference
if (process.env.NODE_ENV !== "production") {
  Object.freeze(store);
}
```

## Verification

- `NODE_ENV=development npm run dev` starts without errors
- Any accidental external mutation throws a TypeError in the console
- Production build (`NODE_ENV=production`) does not freeze the store
- All existing features continue to work

## Rollback

If `Object.freeze(store)` causes issues:
1. Remove the freeze block
2. Restart server
3. Debug the mutation that was caught
4. Re-apply after fixing
