#!/bin/sh
# Minimal stand-in for the Cursor `agent` CLI: ignore argv and print JSON to stdout.
printf '%s\n' '{"type":"result","result":"mcp-e2e-ok"}'
exit 0
