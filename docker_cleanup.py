"""Docker image cleanup için fail-closed retention planlayıcısı."""


def plan_image_cleanup(image_rows, active_image_ids, approved_digests):
    """Return deletion candidates; never deletes or invokes Docker itself."""
    rows = list(image_rows or [])
    active = set(active_image_ids or set())
    approved = set(approved_digests or set())
    candidates = []
    protected = []
    blockers = []
    seen = set()

    for row in rows:
        image_id = row.get("id")
        tags = [str(tag).lower() for tag in row.get("repo_tags", [])]
        if not image_id or image_id in seen:
            continue
        seen.add(image_id)
        has_rollback_tag = any("rollback" in tag for tag in tags)
        if image_id in active or has_rollback_tag or image_id not in approved:
            protected.append(image_id)
        else:
            candidates.append(image_id)

    if not approved and any(row.get("id") not in active for row in rows):
        blockers.append("image-retention-allowlist-missing")
    unknown_approvals = sorted(approved - seen)
    if unknown_approvals:
        blockers.append("image-retention-allowlist-unknown-digest")
    return {"candidates": candidates, "protected": protected, "blockers": blockers}
