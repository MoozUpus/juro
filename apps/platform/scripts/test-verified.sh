#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
loader_url="$(node --input-type=module -e 'import { pathToFileURL } from "node:url"; console.log(pathToFileURL(process.argv[1]).href)' "${script_dir}/cloudflare-workers-loader.mjs")"

cd "${project_root}"
npm run build
node --experimental-loader "${loader_url}" --test tests/rendered-html.test.mjs
node --import tsx --test tests/document-builder.test.ts tests/platform-core.test.ts
