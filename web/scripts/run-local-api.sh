#!/bin/zsh
# Runs the real BEE-OAK server (../VYBERA/server.js) against a LOCAL Postgres database.
# Production integrations are disabled: no Neon DB, no R2 uploads, no SMS/email; payments use the simulator.
createdb beeoak_local 2>/dev/null
cd "$(dirname "$0")/../../VYBERA" || exit 1
export DATABASE_URL=postgresql://localhost/beeoak_local
export PORT=3010
export PAYMENT_SIMULATOR=1
export R2_ENDPOINT= R2_BUCKET= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY=
export SMTP_USER= SMTP_PASS= TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN=
exec node server.js
