#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
wrangler="${project_root}/node_modules/.bin/wrangler"
dry_run_dir=""

cleanup() {
  if [[ -n "${dry_run_dir}" && "${dry_run_dir}" == /tmp/juro-cloudflare-dry-run.* ]]; then
    rm -rf -- "${dry_run_dir}"
  fi
}
trap cleanup EXIT

if [[ ! -x "${wrangler}" ]]; then
  echo "Wrangler is unavailable. Run npm run install:ci first." >&2
  exit 69
fi

for environment in development staging production; do
  echo "Validating ${environment} Cloudflare artifact..."
  if [[ "${environment}" == "development" ]]; then
    env -u CLOUDFLARE_ENV npm run build
  else
    CLOUDFLARE_ENV="${environment}" npm run build
  fi

  dry_run_dir="$(mktemp -d /tmp/juro-cloudflare-dry-run.XXXXXX)"
  "${wrangler}" deploy \
    --dry-run \
    --config "${project_root}/dist/server/wrangler.json" \
    --outdir "${dry_run_dir}"
  rm -rf -- "${dry_run_dir}"
  dry_run_dir=""
done
