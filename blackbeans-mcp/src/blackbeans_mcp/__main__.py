from __future__ import annotations

import argparse
import os

from blackbeans_mcp.server import run_http
from blackbeans_mcp.server import run_stdio


def main() -> None:
    parser = argparse.ArgumentParser(description="BlackBeans MCP server")
    parser.add_argument(
        "--http",
        action="store_true",
        help="Run Streamable HTTP transport instead of stdio",
    )
    parser.add_argument("--host", default=os.environ.get("MCP_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("MCP_PORT", "8100")))
    args = parser.parse_args()
    if args.http:
        run_http(host=args.host, port=args.port)
    else:
        run_stdio()


if __name__ == "__main__":
    main()
