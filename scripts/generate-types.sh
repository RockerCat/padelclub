#!/usr/bin/env bash
set -euo pipefail

# Regenerates src/types/database.ts from the live Supabase schema, then
# re-links it to src/types/domain.ts — the hand-written convenience types
# (Club, Tournament, ClubRole, PricingRule, etc.) that used to live
# appended directly inside database.ts, until a raw `supabase gen types`
# run silently overwrote the whole file and wiped ~150 imports across the
# app in one shot.
#
# database.ts is a pure codegen artifact now — always safe to overwrite —
# and domain.ts is a separate file gen types never touches. This script is
# the one thing that has to remember to re-attach the two; that's exactly
# why it's a script and not a step in someone's memory. Never run
# `supabase gen types` directly for this project — always go through
# `npm run types:generate` (which calls this file).

PROJECT_ID="rfzyqmvqmqsjigcvxxnf"

npx supabase gen types typescript --project-id "$PROJECT_ID" > src/types/database.ts

cat >> src/types/database.ts <<'EOF'

// AUTO-APPENDED — do not edit above this line by hand, and do not add
// anything below it by hand either. Everything above is raw `supabase gen
// types` output; this link is re-added automatically every time by
// scripts/generate-types.sh (npm run types:generate). The actual
// hand-written types (Club, Tournament, ClubRole, PricingRule, etc.) live
// in ./domain.ts, which this file never contains directly — that's what
// lets database.ts be regenerated/overwritten safely at any time.
export * from "./domain";
EOF

echo "src/types/database.ts regenerated and re-linked to domain.ts"
