---
name: release
description: >
  Full release flow for power2plant. Finds lowest open release PR, validates CI,
  fixes package.json version if needed, merges to main, creates GitHub release
  with summary, then creates next version branch and draft PR.
  Trigger: user says "release", "do the release", "ship it", "release v0.X.Y".
---

# Release Skill

When triggered, execute every step below in order. Stop and report if any step fails.
All `gh` and `git` commands run from `/app` (the project root, which is the git working tree).

---

## Step 1 — Validate

```bash
bash scripts/release.sh validate
```

Parse the output:
- If exit 0 with `VALIDATE_OK ...` → extract `PR`, `BRANCH`, `VERSION`. Continue to Step 2.
- If exit 2 with `VERSION_MISMATCH` → fix package.json (Step 1b), then re-run validate.
- Any other error → report verbatim and stop.

### Step 1b — Fix version mismatch (only if needed)

The output will include `NEEDS_FIX: set package.json .version to X.Y.Z`.

1. Edit `package.json`, set `.version` to the target version.
2. Commit: `git -C /app add package.json && git -C /app commit -m "chore: bump version to X.Y.Z"`
3. Push: `git -C /app push`
4. Re-run Step 1.

---

## Step 2 — Merge

```bash
bash scripts/release.sh merge <PR_NUMBER>
```

This merges the release PR into main with a standard merge commit and deletes the branch.
Confirm success before continuing.

---

## Step 3 — Generate release notes and publish

First, collect raw material:

```bash
bash scripts/release.sh publish <VERSION>
```

This prints commits since last tag. Use that list plus the PR title and body (fetch with
`gh pr view <PR_NUMBER> --repo Ecohackerfarm/power2plant --json title,body`) to write
the release notes. Follow the format of the last release (see `gh release view` output):

- `## What's new` section with grouped bullet points by feature area
- `## Post-deploy steps` section only if the commits include migrations or enrichment scripts
- Concise, technical, no fluff

Then create the release:

```bash
gh release create "v<VERSION>" \
  --repo Ecohackerfarm/power2plant \
  --title "v<VERSION>" \
  --notes "<generated notes>" \
  --target main
```

---

## Step 4 — Create next version branch

```bash
bash scripts/release.sh next <VERSION>
```

This:
- Checks out `origin/main` as a new branch `release/vX.(Y+1).0`
- Bumps `package.json` version to `X.(Y+1).0`
- Prints `NEXT_VERSION` and `NEXT_BRANCH`

Then:
1. Commit: `git add package.json && git commit -m "chore: bump version to X.(Y+1).0"`
2. Push: `git push -u origin release/vX.(Y+1).0`
3. Open draft PR:
   ```bash
   gh pr create \
     --repo Ecohackerfarm/power2plant \
     --title "Release v<NEXT_VERSION>" \
     --body "Release branch for v<NEXT_VERSION>." \
     --base main \
     --draft
   ```

---

## Step 5 — Report

Tell the user:
- Release `vX.Y.Z` is live: link to the GitHub release
- Next branch `release/vX.(Y+1).0` created: link to the draft PR
- Any post-deploy steps from the release notes (if any)
