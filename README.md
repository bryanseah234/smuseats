# SMU Seats

## Merge multiple PRs into `main` (preserve commits)

Use the task script:

```bash
scripts/merge-prs-preserve-commits.sh --base main --prs 1,2,3,4,5
```

Optional flags:
- `--remote origin` (default: `origin`)
- `--branch integration/pr-1-5-into-main` (custom integration branch name)

The script fetches each PR head (`pull/<n>/head`) and merges with `--no-ff` so commit history is preserved.
