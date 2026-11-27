#!/bin/zsh
# Like run-prod-db-api.sh, but with the REAL PayU checkout (no simulator).
# Uses the PayU keys/env from ../VYBERA/.env (PAYU_ENV=test → PayU sandbox, no real money).
cd "$(dirname "$0")/../../VYBERA" || exit 1
export PORT=3010
export PAYMENT_SIMULATOR=0
export PAYU_CALLBACK_BASE=http://localhost:3010
exec node server.js
