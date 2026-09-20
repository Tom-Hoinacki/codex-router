import importlib.util
import pathlib
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("gateway_entry", pathlib.Path(__file__).resolve().parents[1] / "src/gateway-entry.py")
entry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entry)
import sys
sys.modules["gateway_entry"] = entry

class GatewayEntryTest(unittest.TestCase):
    def test_only_fatal_accept_error_exits(self):
        loop = Mock()
        with patch.object(entry.os, "_exit") as exit:
            entry.fatal_accept_handler(loop, {"message": "upstream reset", "exception": ConnectionResetError()})
            exit.assert_not_called()
            entry.fatal_accept_handler(loop, {"message": "Accept failed on a socket", "exception": OSError(64, "lost listener")})
            exit.assert_called_once_with(70)
        self.assertEqual(loop.default_exception_handler.call_count, 2)

    @unittest.skipUnless(hasattr(entry.asyncio, "ProactorEventLoop"), "Windows only")
    def test_uvicorn_factory_installs_handler(self):
        from uvicorn.config import Config
        loop = Config("unused", loop="gateway_entry:gateway_loop_factory").get_loop_factory()()
        try:
            self.assertIs(loop.get_exception_handler(), entry.fatal_accept_handler)
        finally:
            loop.close()

if __name__ == "__main__":
    unittest.main()
