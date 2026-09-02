# Release runner parity implementer report

## RED

- `python -m unittest -v release_runner_test.py` (baseline): 16 tests passed before the new contract tests.
- `python -m unittest -v release_runner_test.py; node --test server/releaseManifest.test.mjs`: failed as intended after adding the tests. Python had 2 failures: the verification plan used `nexus-20260901-120000-candidate` instead of `marlin-nexus-candidate-nexus-20260901-120000`, and accepted a missing `candidate_port`. Node had 1 failure: the JavaScript manifest rejected the Python-compatible `ssh.hostKey` field.

## Changed files

- `release_runner.py`
- `release_runner_test.py`
- `server/releaseManifest.mjs`
- `server/releaseManifest.test.mjs`
- `.superpowers/sdd/2026-09-01-nexus-remediation/release-runner-parity-report.md`

## GREEN

- `python -m unittest -v release_runner_test.py`: 17 tests passed.
- `node --test server/releaseManifest.test.mjs`: 4 tests passed.
- `python -m unittest -v release_runner_test.py release_artifact_test.py`: 22 tests passed.
- `python -m py_compile release_runner.py release_artifact.py`: passed with exit code 0.

## Concerns

- `main()` remains preflight-only; no upload, cutover, rollback, deployment, restart, server mutation, or CPM access was performed.
- Candidate verification now requires an explicit integer `candidate_port` in its configuration, rejects invalid/production-collision ports, uses the compose-derived candidate name, and targets that port for all candidate HTTP commands.
- Python and JavaScript manifest validation now use `ssh.hostKey` with the same pinned `SHA256:` shape; password fallback, host-key auto-accept, TLS bypass, and financial readiness blockers were not weakened.
- The worktree contained unrelated pre-existing changes and untracked files. Only the bounded files listed above are intended for this slice.
