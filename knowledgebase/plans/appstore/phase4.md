# AppStore Standardization — Phase 4: Freeze in Development

## Objective

Add `Object.freeze(store)` in development to catch accidental mutations at runtime.

## Implementation

Add one line to `backend/src/index.ts` after creating the `AppStore` instance (after line 39):

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

3. **Mutation via TypeScript type assertions:**
   ```ts
   (store as any).tradesList = [];  // TypeError in strict mode
   ```

## What This Does NOT Catch

1. **Shallow freeze only**: Nested objects/arrays are not frozen.
   - `store.config.lotSize = 999` would still work if `config` object is not frozen
   - `store.trades.push(newTrade)` would still work if `trades` array is not frozen

2. **Set/Map contents**: `Object.freeze()` only freezes the Set/Map reference, not its contents.
   - `store.mt5BridgeClients.add(ws)` would still work
   - This is why Phase 1 adds `ReadonlySet<WebSocket>` getters

3. **Internal mutations**: `Object.freeze()` does not catch mutations inside `AppStore` methods (which is intentional).

## Complementary Approaches

### Deep freeze for critical objects

If you want to catch nested mutations, deep-freeze critical state objects in the constructor:

```ts
constructor() {
  this.tradeConfig = Object.freeze(getDefaultTradeConfig());
  this.nextTicket = Object.freeze({ value: scalarAiDb.getMaxTicket() + 1 });
  // ...
}
```

### Proxy-based deep freeze (experimental)

```ts
if (process.env.NODE_ENV !== "production") {
  const handler: ProxyHandler<AppStore> = {
    set(target, prop, value) {
      throw new TypeError(`Cannot set property ${String(prop)} on AppStore`);
    },
  };
  Object.freeze(store);
}
```

This catches attempts to add new properties but not nested mutations.

## When to Apply

- Apply AFTER Phase 1 (private fields) so TypeScript doesn't complain about `private` fields being frozen
- Apply BEFORE Phase 2 (interface split) so you catch any missed mutations during the interface transition
- Remove or conditionally apply if performance testing shows freeze overhead (unlikely for a single object)

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
