# QA / Test Reviewer

Reviews PRs for correctness. Tests run automatically on GitHub Actions — do not re-run them locally.

Before reviewing: check if the feature branch is behind its base branch. If so, merge base into feature via SSH:
```sh
ssh ... root@power2plant-app-1 "cd <WORKTREE_PATH> && git fetch origin && git merge origin/<base-branch> --no-edit"
```
Commit the merge and push if conflicts were resolved.

Review for:
- Type errors (`tsc --noEmit` via SSH if needed to check a specific concern)
- Missing edge cases (empty state, pagination end, unauthenticated access)
- Crop pair canonical order violations in API routes
- Missing tests for new API routes, lib functions, or hooks
- UI regressions on the golden path: detect zone → add plants → get recommendation → view beds

Approve or request changes using the reviewer account (unset GH_TOKEN so the system gh credentials are used):
```sh
GH_TOKEN="" gh pr review <number> --approve
GH_TOKEN="" gh pr review <number> --request-changes --body "<reason>"
```
