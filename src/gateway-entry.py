"""Windows LiteLLM entrypoint: a lost accept loop must not masquerade as alive."""
import asyncio
import os
import sys


def fatal_accept_handler(loop, context):
    loop.default_exception_handler(context)
    # CPython Proactor closes the listening socket after this error, but keeps
    # the process alive. Exit only for this fatal listener error, not ordinary
    # upstream resets or cancelled requests. The Node supervisor owns restart.
    if context.get("message") == "Accept failed on a socket":
        print("[gateway] fatal accept-loop failure; exiting for supervised recovery", file=sys.stderr, flush=True)
        os._exit(70)


def gateway_loop_factory(use_subprocess=False):
    loop = asyncio.ProactorEventLoop()
    loop.set_exception_handler(fatal_accept_handler)
    return loop


if __name__ == "__main__":
    from litellm.proxy.proxy_cli import ProxyInitializationHelpers, run_server

    # Use uvicorn's documented loop-factory import surface; leave the installed
    # packages and their lock untouched. __main__ is this process-local module.
    ProxyInitializationHelpers._get_loop_type = staticmethod(lambda: "__main__:gateway_loop_factory")
    run_server()
