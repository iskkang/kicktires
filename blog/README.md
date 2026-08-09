# Blog content store

Written by the generator in `scripts/blog/`, not by hand.

- `posts/<slug>.json` — one article, with the figures it is allowed to state
- `evidence/<year>-<make>-<model>.json` — the federal-record snapshot it was written from
- `images/<slug>/` — hero images, served from this deploy rather than hotlinked
- `runs/<timestamp>.json` — what each run did, including why a run published nothing
- `ledger.json` — published slugs and primary keywords, so a subject is not published twice

This directory is empty until the first successful run. It is deliberately not seeded with a
sample post: every figure in a post has to come from a live federal record, and a
hand-written example would be exactly the fabricated content the pipeline exists to refuse.
