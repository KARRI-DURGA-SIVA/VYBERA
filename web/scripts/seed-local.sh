#!/bin/zsh
# Creates test accounts in the LOCAL database (run after run-local-api.sh is up).
#   organizer@beeoak.test / Organizer@2026   (creator, KYC approved)
#   asha@beeoak.test, ben@beeoak.test / Customer@2026   (customers)
cd "$(dirname "$0")/.." || exit 1
DOC="data:image/png;base64,$(base64 -i public/logo.png | tr -d '\n')"
printf '{"name":"Hive Events Co","email":"organizer@beeoak.test","phone":"9000000001","category":"Opportunity","about":"Opportunity and music events","password":"Organizer@2026","documents":[{"documentType":"pan","fileName":"pan.png","dataUrl":"%s"}]}' "$DOC" \
  | curl -s -X POST localhost:3010/creator/applications -H 'Content-Type: application/json' --data @- >/dev/null
psql -d beeoak_local -qc "UPDATE creator_accounts SET kyc_status='Approved' WHERE email='organizer@beeoak.test'"
(cd ../VYBERA && node -e "
const bcrypt=require('bcrypt');const {Pool}=require('pg');const pool=new Pool({connectionString:'postgresql://localhost/beeoak_local'});
(async()=>{const h=await bcrypt.hash('Customer@2026',10);
for (const [f,l,e,p] of [['Asha','Rao','asha@beeoak.test','9000000101'],['Ben','Thomas','ben@beeoak.test','9000000102']])
 await pool.query(\"INSERT INTO users (username,email,password,first_name,last_name,phone,country_code,city) VALUES (\$1,\$2,\$3,\$4,\$5,\$6,'+91','Bengaluru') ON CONFLICT (email) DO NOTHING\",[e.split('@')[0],e,h,f,l,p]);
await pool.end();console.log('Seeded local test accounts');})()")
