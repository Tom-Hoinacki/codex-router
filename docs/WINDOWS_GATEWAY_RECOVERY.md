# Windows gateway recovery

## Incident observed on 2026-09-20

At inspection, 4200 refused connections while 4201, 4202, 4203 and 4208
were listening. The watchdog had detected failed liveness after the
16:55:21 UTC request log entry. Replacement gateways repeatedly exceeded the
300-second startup budget. The gateway eventually recovered after six
attempts around 17:24 UTC, before deployment of this change.

The earlier recorded WinError 64 is explained by Python 3.12 Proactor's
accept-error path: it closes the listening socket without exiting the process.
No new WinError 64 traceback was recorded immediately before this latest
outage, so that exact trigger is not established for the latest recurrence.
Neither JEV concurrency nor model selection has been demonstrated as its cause.
Native Luna requests continued succeeding during portions of the outage;
native traffic does not traverse the LiteLLM gateway.

## Repair

- The bundled Windows gateway uses a small Python entrypoint with a Proactor
  exception handler. Only the fatal `Accept failed on a socket` condition
  exits the gateway; ordinary request/reset errors retain normal handling.
  It uses the pinned uvicorn custom loop-factory interface without changing
  the Python packages or dependency lock.
- Gateway replacement awaits the existing Windows process-tree termination
  helper rather than killing only the launcher. Consecutive failed starts
  have a separate bound, so slow starts cannot continually age out of the
  rolling failure window. Restart messages include UTC timestamps.
- A refused loopback gateway connection waits up to 180 seconds for readiness
  before delivering the identical request. There is no replay of HTTP errors,
  connection resets, or partial responses. Cancellation stops the wait.
- Exhaustion retains the existing full-service exit path. This installation's
  scheduled task has a repeating heartbeat for automatic service relaunch.

## Verification

- 14 supervisor/recovery unit tests; 2 Windows Python entrypoint tests.
- 46 existing gateway/health/startup/launcher/native-retry tests passed when
  run sequentially. Initial concurrent run had a startup deadline failure;
  timestamp assertions were updated for the new log prefix.
- Extended real-process integration closes the listener while keeping the
  gateway alive, then verifies replacement and termination of its old PID.
- Repository syntax/consistency checks and whitespace validation.
- Controlled live failure at 17:37:21 UTC: gateway ready at 17:37:32 UTC;
  a Responses request submitted during unavailability completed HTTP 200 in
  13.661 seconds. Router PID 22956 remained unchanged.
- Existing DeepSeek Codex session resumed successfully after recovery.
  Real Luna High requests passed before and after deployment.
- Three further Responses requests completed HTTP 200 (24.912s, 1.877s,
  1.896s). Both health endpoints returned 200.
- The browser daemon had a separate stale Chrome WebSocket. Supported harness
  reconnection plus Chrome approval restored it. One real JEV decision clicked
  a button on an isolated test page and produced the expected BROWSER_OK text.
  No existing project tab or game checkout was modified.

This proves bounded automatic recovery for the tested failure paths, not the
absence of all future 502s. Provider outages, resets after streaming begins,
or recovery exceeding the readiness budget can still fail individual turns.
The reason the original replacement imports repeatedly exceeded five minutes
was not established by retained logs; later diagnostic starts completed normally.
