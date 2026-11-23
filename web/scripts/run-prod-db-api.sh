#!/bin/zsh
# Runs the updated BEE-OAK server (../VYBERA/server.js) on this Mac against the PRODUCTION database
# and integrations from ../VYBERA/.env (Neon, R2, SMS, email). Only payments are simulated.
cd "$(dirname "$0")/../../VYBERA" || exit 1
export PORT=3010
export PAYMENT_SIMULATOR=1
exec node server.js
