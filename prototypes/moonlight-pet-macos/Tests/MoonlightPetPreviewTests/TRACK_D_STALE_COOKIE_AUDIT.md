# Track D: stale desktop-cookie audit fixture

Baseline: `935a22fed28eea42309be7b3490cfdfec0b4a00b`.

## Status

**Prepared, not native-executed.** The authorized cloud workspace has no `swiftc`/`swift`. An attempted local invocation stopped at `swiftc: command not found` (exit 127). No fixture compiled or ran. The stale-cookie hypothesis is therefore **unreproduced**, not a confirmed production defect. No production authentication file changed, no real account or Keychain was accessed, and no user Mac, remote CI, push or deployment was used.

Prior native CI's 39 passing checks predate these audit cases. They do not establish a result for this hypothesis. This commit is a fixture proposal, not an integration or publication request.

## Opt-in command

In a separately authorized environment that already provides the required native Swift SDK:

```sh
./prototypes/moonlight-pet-macos/script/test_hub_transport.sh --audit-stale-cookie
```

The candidate workflow invokes this flag in a separate, time-bounded hosted Mac step. The ordinary invocation continues to select the unchanged 39 baseline cases. The new flag selects nine audit groups instead. Both must pass; selecting the audit does not replace baseline coverage. Hosted results must be reported for their exact commit before calling the fixture compiled or verified. No user computer, account or Keychain is needed.

## Matrix and assertions

1. **Unchanged verified intent:** start with future-expiry `rejected.signature`, receive HTTP 401, authenticate successfully into `accepted.signature`, then reread the unchanged desktop snapshot. Expect one authentication, only the accepted cookie published with the original epoch, and a successful protected-read replay using that accepted cookie. This is the primary unproven hypothesis.
2. **Intent changes after authentication:** separate logout, epoch-change, foreign-origin and unavailable-peer snapshots. Expect no publication, no protected-read replay, and an explicit cancellation/unavailable error. A durable logout must preserve credentials because it does not authorize deleting them.
3. **Publication acknowledgement:** separately vary absent response, cookie value, epoch, logout status and origin. Cookie/epoch/origin mismatch fixtures preserve all other candidate fields, including expiration, to isolate each check. Expect fail-closed, no protected-read replay and unchanged credentials. A matching fresh post-auth snapshot isolates these checks from case 1.
4. **Disconnect with held intent read:** invalidate the transport before releasing the old desktop read. Expect cancellation, no publication and no replay.
5. **Disconnect with held publication acknowledgement:** invalidate after publication starts but before its reply. Expect cancellation and no replay; do not claim an already-started publication was undone.
6. **Canceled caller:** cancel while the shared automatic-auth operation awaits a desktop read. The caller must not receive protected data. Any publication must contain only the fresh cookie. Publication count is observational: canceling one waiter is not assumed to cancel shared authentication needed by another waiter. This fixture does not create a broader cancellation/security policy.
7. **Explicit-login lifetime:** reuse the verified fail-closed test: a rejected manual login never falls back to stored credentials in the same transport; a new transport attempts stored credentials once, then stops looping.
8. **Late HTTP response after sign-out:** reuse the isolated late-response test, requiring discarded response cookies.
9. **Disconnect during pending automatic HTTP authentication:** reuse the isolated cancellation test, requiring no replay and correct credential preservation/removal scope.

## Isolation

`TransportURLProtocol` intercepts all test HTTP. The new `TrackDHTTP` double accepts only the synthetic `hub.example.test` host, returns fixed JSON, and logs only fake cookie identifiers. Credential storage is `MemoryHubCredentials`; the local native bridge callback is explicitly `{ nil }`. The injected desktop bridge is in-memory and has no socket or file access. No real username/password, token, database, server or app state is used.

Held reads retain all continuations through the already-reviewed `HeldSessionRead` helper. Gate-start polling is bounded to three seconds; gates are released before awaiting the request's result. Existing baseline assertions are unchanged.

## Static observations, not runtime proof

Current `HubTransport.authenticate` invokes the cookie-importing `syncDesktopSession` after receiving the fresh authentication cookie, then chooses `savedSession` for publication. A still-unexpired rejected desktop cookie appears able to overwrite that fresh private cookie during the check. Native execution of case 1 is required to establish the actual behavior. No fix should be accepted on this static observation alone.

If native execution later confirms the hypothesis, any separately approved fix must retain logout, epoch, origin, generation, cancellation and publication-acknowledgement validation. It must not reenable fallback after rejected explicit login or silently widen authentication behavior.
