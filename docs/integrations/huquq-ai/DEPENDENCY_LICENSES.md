# Dependency licence report

Audit date: 2026-08-15. This inventory was generated from the installed trees
resolved by the checked-in npm lockfiles; it did not infer licences from package
names or the Huquq AI repository.

| Application | Lockfile SHA-256 | Installed packages | Licence families |
| --- | --- | ---: | --- |
| `apps/platform` | `595B79F085DB5179C5A6FB2AF6E4A5533A3202A0044254AFE8988C7983BCC9BF` | 522 | MIT 429; Apache-2.0 28; ISC 20; BSD-2-Clause 12; MPL-2.0 8; BSD-3-Clause 6; MIT/Zlib 5; MIT or Apache-2.0 4; 0BSD 2; CC0-1.0 2; five other declared families; one root package without a licence field |
| `apps/website` | `874EE98110F7D8006EDDC4B82D1B72B75A1202F94EFEF40017829CCF0089BBDB` | 509 | MIT 425; Apache-2.0 28; ISC 20; BSD-2-Clause 11; MPL-2.0 8; BSD-3-Clause 5; MIT or Apache-2.0 4; CC0-1.0 2; 0BSD 1; four other declared families; one root package without a licence field |

The undeclared entries are JURO's own private root packages (`juro-app` and
`juro-legaltech`), not third-party dependencies.

CI runs `npm run license:check` against the complete lockfile topology, including
optional packages for other operating systems. The current policy check passes
730 platform and 716 website lockfile entries. It rejects undeclared third-party
licences, AGPL/SSPL/BUSL/Commons Clause entries, and any new licence family that
has not been reviewed explicitly.

## Direct dependencies

The platform has 34 direct installed packages and the website has 23. Their
declared licences are permissive: MIT, Apache-2.0, ISC, BSD-3-Clause, or a
permissive MIT/Apache choice, with these reviewed exceptions:

- `pizzip@3.2.0` is dual-licensed `(MIT OR GPL-3.0)`. JURO uses the MIT option;
  no GPL option is selected and no Huquq AI dependency introduced it.
- Optional `@img/sharp-*` and `@img/sharp-libvips-*` platform packages include
  Apache-2.0 and LGPL-3.0-or-later declarations. They arrive through `sharp`;
  native OS packages are used by local/build tooling and are not part of the
  emitted Cloudflare Worker or browser asset bundle. If JURO later redistributes
  a native binary itself, the Apache/LGPL notices and corresponding-source or
  relinking obligations must be reviewed for that distribution.
- `argparse@2.0.1` (`Python-2.0`) is a development-only ESLint transitive
  dependency. `caniuse-lite` (`CC-BY-4.0`) is build metadata. Neither is legal
  corpus content or a source of JURO legal answers.
- Eight transitive packages declare MPL-2.0. The scan found no AGPL, SSPL,
  BUSL or Commons Clause package in either installed tree.

## Reproduction

Run from each application directory after `npm ci`:

```text
npm query '*' --json
npm query ':root > *' --json
npm explain @img/sharp-win32-x64
npm explain pizzip
```

Group the first result by its `license` field and treat missing fields as a
manual-review item. CI additionally runs
`node ../../scripts/check-dependency-licenses.mjs .` against the complete
lockfile. Re-run this report whenever either lockfile changes. This
inventory is a dependency due-diligence record, not a substitute for preserving
the licence texts/notices required by each package in an actual distribution.

## Separate data-right boundary

Dependency licences and the Huquq AI MIT licence do not grant rights in Lex.uz
text, downloaded HTML, screenshots, logos, external datasets, model weights,
fonts or provider outputs. JURO does not commit the legal corpus to Git and does
not treat those materials as MIT code.
