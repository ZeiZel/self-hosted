# Production-Readiness Review — Self-Hosted Infrastructure Platform

**Reviewer:** DevOps/Security review (automated, evidence-based)
**Date:** 2026-07-01 (re-audit)
**Supersedes:** the 2026-06-29 review (this document replaces it; the original per-chart
audit predates the `chart-base` migration and is retained only as historical detail at
the bottom).
**Scope:** `kubernetes/chart-base/` + `kubernetes/charts/` (29 app charts),
`kubernetes/releases/`, `kubernetes/apps/`, `kubernetes/envs/k8s/secrets/`, `ansible/`,
CI (`.github/workflows/`, `.pre-commit-config.yaml`)
**Governing rules:** `.docs/arch-rules.md` (HELM-001, HELM-004…010, CICD-001),
`AGENTS.md`, `CLAUDE.md`

---

## Verdict: **NO-GO** (much reduced blocker set)

Since the previous review the platform migrated all app charts onto the shared
**`chart-base`** subchart. This **structurally resolved the largest class of blockers** —
securityContext, RBAC, NetworkPolicy, PDB and ServiceMonitor are now rendered centrally
for every consuming chart (with mandatory securityContext defaults baked into
`chart-base/templates/_helpers.tpl`), so the old per-chart gaps (B-4, B-5, H-1, H-5, M-2)
no longer apply.

What remains **blocks GO**, but it is a short list:

1. **Git-tracked plaintext secrets** — `kubernetes/envs/k8s/secrets/_all_plain.yaml` is
   still committed in cleartext and is the file the active Helmfile environment actually
   reads (**B-1**). A tracked Ansible-vault `.bak` also persists (**B-2**).
2. **Hardcoded credential defaults** in `stoat` and `remnawave` chart values (**H-3**).
3. **No CI security gate** — the pre-commit suite is good but unenforced in GitHub
   Actions (**H-7**).
4. **Vault injection still not met** — `chart-base` renders `kind: Secret` from values
   rather than using Vault agent injection (**H-2**, downgraded from structural to
   design-debt but still a rule deviation).

Clear B-1, B-2, H-3, H-7 (and complete H-2) before reconsidering.

---

## Re-audit summary (status of prior findings)

| ID | Finding | Status (2026-07-01) | Evidence |
|---|---|---|---|
| B-1 | Plaintext `_all_plain.yaml` tracked | **OPEN** | file still in `git ls-files`; it is the file `environments.yaml.gotmpl` loads |
| B-2 | `vault.yml.bak` tracked | **OPEN** | still tracked; `.gitignore` lacks `*.bak` |
| B-3 | Mutable image tags | **MOSTLY RESOLVED** | 0 mutable tags left in chart `values.yaml`; only `releases/kestra.yaml.gotmpl` still has `tag: latest` |
| B-4 | consul missing rbac/netpol/pdb + securityContext | **RESOLVED (chart-base)** | consul now depends on chart-base (rbac, networkpolicy, PDB, securityContext defaults) |
| B-5 | Workloads with no securityContext | **RESOLVED (chart-base)** | `_helpers.tpl` sets pod + container securityContext defaults for all consumers |
| H-1 | Systemic securityContext incompleteness | **RESOLVED (chart-base)** | same centralized defaults apply the full mandated set |
| H-2 | 13 charts create `kind: Secret` from values | **CHANGED / OPEN** | 0 per-chart `secret.yaml`; centralized in `chart-base/templates/secrets.yaml`, still `kind: Secret` (not Vault injection) |
| H-3 | Hardcoded passwords (stoat, remnawave) | **OPEN** | `stoat/values.yaml` `rabbitpass`; `remnawave/values.yaml` `change_me_metrics` |
| H-4 | TeamCity Docker-socket hostPath | **OPEN** | `teamcity/values.yaml` still defines the `/var/run/docker.sock` hostPath volume + mount (rendered via chart-base) |
| H-5 | n8n/zerobyte missing pdb | **RESOLVED (chart-base)** | PDB rendered by `observability.yaml` |
| H-6 | gitlab-ingress missing mandatory templates | **OPEN** | still `_helpers.tpl, ingressroute.yaml, middleware.yaml, tests/`; not on chart-base (documented exemption pending) |
| H-7 | No CI security gate | **OPEN** | `.github/workflows/` = build-docs, labels, release only; no `validate.yml` |
| M-1 | logging privileged init / root shippers | **NEEDS RE-REVIEW** | logging workloads now flow through chart-base; re-check privileged init/hostPath |
| M-2 | teamcity misnamed workload file | **RESOLVED (chart-base)** | teamcity templates removed (rendered by chart-base) |
| M-3 | `.beads/config.yaml` stale path | **OPEN** | still references `/Users/zeizel/.beads-planning` |
| L-1 | `.gitignore` too narrow | **OPEN** | no `*.bak` / `*_plain.yaml` patterns |

New since last review (informational, not blockers): Helm upgraded to **v4** and
`helmDefaults.force` removed for server-side-apply compatibility; routing default moved to
**Gateway API (HTTPRoute)**; a Go/Charm `selfhost` CLI replaced the Bun/NestJS one.

---

## Chart compliance (chart-base model)

The 2026-06-29 per-chart × 7-template matrix is **obsolete**: the 29 app charts now have
empty `templates/` (`.gitkeep`) and inherit every mandatory resource from `chart-base`.
Compliance is therefore audited **once, against `chart-base`**:

| Mandatory resource | Provided by | Status |
|---|---|---|
| ServiceAccount + RBAC | `chart-base/templates/rbac.yaml` | ✓ |
| NetworkPolicy | `chart-base/templates/networkpolicy.yaml` | ✓ |
| ServiceMonitor (`prometheus: kube-prometheus`) | `chart-base/templates/observability.yaml` | ✓ |
| PodDisruptionBudget | `chart-base/templates/observability.yaml` | ✓ |
| Workloads + securityContext defaults | `chart-base/templates/workloads.yaml` + `_helpers.tpl` | ✓ |
| Routing (HTTPRoute default) | `chart-base/templates/routing.yaml` | ✓ |
| Helm tests | `chart-base/templates/tests.yaml` | ✓ |
| Secrets | `chart-base/templates/secrets.yaml` | ⚠ renders `kind: Secret` (Vault injection not yet used) |

**Exemptions (keep own templates):** `namespaces` (cluster bootstrap: namespaces, shared
Gateway/GatewayClass, ClusterIssuers, default-deny NetworkPolicies) and `gitlab-ingress`
(Traefik IngressRoute + Middleware helper — H-6: document the exemption or migrate).

`helm lint` still passes for all charts. `kubeval`/schema validation remains unenforced in
CI (H-7).

---

## Prioritized Remediation Checklist (must clear for GO)

- [ ] **B-1** Remove `kubernetes/envs/k8s/secrets/_all_plain.yaml` from git; gitignore `*_plain.yaml`; source secrets only from SOPS `_all.yaml`.
- [ ] **B-2** Remove `ansible/group_vars/all/vault.yml.bak` from git; gitignore `*.bak`.
- [ ] **B-3** Pin `releases/kestra.yaml.gotmpl` to an immutable tag (last remaining `tag: latest`).
- [ ] **H-2** Migrate `chart-base/templates/secrets.yaml` consumers to Vault agent injection; remove any `default "changeme"` fallbacks.
- [ ] **H-3** Remove hardcoded passwords in `stoat/values.yaml` and `remnawave/values.yaml`; source via SOPS/Vault.
- [ ] **H-4** Eliminate/isolate the TeamCity Docker-socket hostPath mount (still defined in `teamcity/values.yaml`); use rootless/Kaniko/BuildKit.
- [ ] **H-6** Document a pod-less-helper exemption for `gitlab-ingress` in `.docs/arch-rules.md`, or migrate it.
- [ ] **H-7** Add `.github/workflows/validate.yml` mirroring `.pre-commit-config.yaml` (gitleaks, helm lint, `helm template | kubeval --strict`, conftest, trivy, ansible-lint); point the ansible syntax hook at `hosts.example.ini`.
- [ ] **M-1** Re-review logging privileged init / root shippers post-migration; gate and document exceptions.
- [ ] **M-3 / L-1** Fix `.beads/config.yaml` path; broaden `.gitignore` (`*.bak`, `*_plain.yaml`).

---

## Recommendations

1. **Secrets hygiene first** — B-1/B-2 are the only true "leak-shaped" blockers left;
   remove the tracked plaintext/backup files and switch the Helmfile environment off
   `_all_plain.yaml` onto SOPS `_all.yaml`.
2. **CI parity** — add `validate.yml` so the (already excellent) pre-commit gate is
   enforced on every push; install kubeval, conftest, trivy in the runner.
3. **Finish Vault adoption** — chart-base centralized secret rendering; the remaining step
   is switching `secrets.yaml` to Vault agent injection so no `kind: Secret` is minted.
4. **Policy-as-code** — Conftest/OPA rules to fail the build on mutable tags, missing
   securityContext fields, value-based `kind: Secret`, and `hostPath`/`privileged` without
   an allow-list annotation. (securityContext defaults are already centralized in
   chart-base `_helpers.tpl`.)

---

## Appendix — original 2026-06-29 findings (historical)

The detailed pre-`chart-base` per-chart audit (verdict NO-GO; blockers B-1…B-5; the
28-chart × 7-template compliance matrix) has been superseded by the re-audit above. Its
still-relevant conclusions are folded into the status table; its per-chart securityContext
and template-presence findings (B-4, B-5, H-1, H-5, M-2) were resolved by the migration to
the shared `chart-base` subchart and are retained here only as change history.
