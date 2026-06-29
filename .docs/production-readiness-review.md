# Production-Readiness Review — Self-Hosted Infrastructure Platform

**Reviewer:** DevOps/Security review (automated, evidence-based)
**Date:** 2026-06-29
**Scope:** `kubernetes/charts/` (28 custom charts), `kubernetes/releases/`, `kubernetes/envs/k8s/secrets/`, `ansible/`, CI (`.github/workflows/`, `.pre-commit-config.yaml`)
**Governing rules:** `.docs/arch-rules.md` (HELM-004…010, HELM-006, CICD-001), `AGENTS.md`, `CLAUDE.md`

---

## Verdict: **NO-GO**

The platform is well-structured and `helm lint` passes for every chart, but it is **not production-ready** due to confirmed violations of mandatory binding rules. Three classes of blockers exist: (1) git-tracked **plaintext secrets** (`kubernetes/envs/k8s/secrets/_all_plain.yaml`) and a tracked Ansible-vault `.bak`, violating the no-plaintext-secrets rule; (2) **mutable `:latest`/`master`/`stable` image tags** in 9 release templates and 8 chart `values.yaml` files, violating the "never `:latest`" rule (IMG/HELM); (3) **incomplete or absent Pod/container securityContext** across the large majority of charts — only `excalidraw` and `openclaw` render the full mandated set (runAsNonRoot + readOnlyRootFilesystem + drop ALL + seccomp RuntimeDefault), and 6+ workloads have **no securityContext at all**. Additional structural gaps (`consul` and `gitlab-ingress` missing mandatory templates; 13 charts that create Kubernetes `Secret` objects instead of using Vault injection; hardcoded passwords in two charts; Docker-socket hostPath in the TeamCity agent) compound the risk. Clear the Blocker list below before reconsidering.

---

## Scope & Method

- Ran `helm lint kubernetes/charts/<chart>` over **all 28 custom charts** — all pass, **0 failures, 0 warnings/errors**.
- Rendered each chart with `helm template` and grep-counted securityContext compliance fields, resource limits, image tags, hostPath/hostNetwork/privileged, and `runAsUser: 0`.
- Inspected every `templates/secret.yaml`, `networkpolicy*.yaml`, `rbac.yaml`, and workload manifest.
- Inspected `.sops.yaml`, the encrypted vs plaintext secrets files, `.gitignore`, the Ansible inventory, and `group_vars/all/`.
- Read CI definitions: `.pre-commit-config.yaml` and `.github/workflows/*`.
- **Gap in tooling:** `kubeval` is **not installed** on this machine, so manifest schema validation could not be executed here. The `.pre-commit-config.yaml` `kubeval` hook (`helm template … | kubeval --strict --ignore-missing-schemas`) therefore only runs where a developer has kubeval locally; it is **not enforced in CI**. This is itself a finding (see High-7). `helm template` was used to inspect rendered output as a partial substitute.

---

## Findings by Severity

### BLOCKERS

**B-1 — Git-tracked plaintext secrets file.**
`kubernetes/envs/k8s/secrets/_all_plain.yaml` is committed in cleartext (e.g. `authentikBootstrapPassword: "changeme123"`, `postgresPassword: "changeme"`, `nextcloudAdminPassword`). Its path matches the `.sops.yaml` rule `envs/.*/secrets/.*\.yaml$` yet it is **unencrypted** (the parallel `_all.yaml` IS SOPS/AES256-encrypted). Although values are placeholders, this violates the no-plaintext-secrets rule and trains a dangerous habit; a real value committed here would be silently exposed.
*Fix:* remove `_all_plain.yaml` from git (`git rm --cached`), keep it untracked, and add `*_plain.yaml` / `_all_plain.yaml` to `.gitignore`. Source secrets only through the SOPS-encrypted `_all.yaml`.

**B-2 — Tracked Ansible-vault backup file.**
`ansible/group_vars/all/vault.yml.bak` is committed. It **is** Ansible-vault encrypted (`$ANSIBLE_VAULT;1.1;AES256`), so it is not a cleartext leak, but committing vault `.bak` files is a hygiene/exfiltration risk (old key material, drift) and `.gitignore` does not exclude `*.bak`.
*Fix:* `git rm --cached ansible/group_vars/all/vault.yml.bak`; add `*.bak` to `.gitignore`.

**B-3 — Mutable `:latest` / `master` / `stable` image tags.** Violates "Always pin exact versions. Never use `:latest`" (CLAUDE.md / AGENTS.md / arch-rules image policy).
- Release templates (override pinned chart values back to mutable): `kubernetes/releases/{remnawave,rybbit (x2),excalidraw (sidecar line 18),kestra,stalwart,metube,zerobyte,vert}.yaml.gotmpl` all set `tag: latest`.
- Chart `values.yaml`: `affine` (`stable`), `metube` (`latest`), `rybbit` (`latest` x2), `remnawave` (`latest`), `supabase` (`latest` x2), `vert` (`latest`), `pangolin` (`latest`), `stoat` (`tag: master`).
- Note: `consul` (`1.18.2`) and `n8n` (`1.70.0`) are correctly pinned in both chart and release.
*Fix:* pin every image to an immutable version/digest in the chart `values.yaml`, and remove the `latest` overrides from the release `.gotmpl` files.

**B-4 — `consul` chart missing mandatory templates + no securityContext.**
`kubernetes/charts/consul/templates/` contains only `_helpers.tpl, configmap.yaml, ingress.yaml, service.yaml, serviceaccount.yaml, servicemonitor.yaml, statefulset.yaml, tests/`. **Missing: `rbac.yaml` (HELM-005), `networkpolicy.yaml` (HELM-006), `pdb.yaml` (HELM-009).** The `statefulset.yaml` has **no `securityContext`** at all (renders 0 of the 4 mandated fields). Consul is a core dependency in the deploy chain, so this is in the critical path.
*Fix:* run `kubernetes/scripts/add-rbac.sh consul`, `add-networkpolicy.sh consul`, `add-pdb.sh consul`; add pod + container securityContext per HELM-007.

**B-5 — Workloads with no securityContext whatsoever.**
The following render **0/4** mandated securityContext fields and have no `securityContext:` block: `consul/statefulset.yaml`, `n8n/deployment.yaml`, `vert/deployment.yaml`, all 7 `stoat/*/deployment.yaml`, `logging/kibana/deployment.yaml`, `logging/logstash/deployment.yaml`, `monitoring/promtail/daemonset.yaml`. This violates the mandatory Pod Security Context rule (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp RuntimeDefault, allowPrivilegeEscalation:false).
*Fix:* add the standard securityContext block to each; use `emptyDir` for writable paths where `readOnlyRootFilesystem: true` is enforced.

### HIGH

**H-1 — Systemic securityContext incompleteness (most charts).**
Even charts that *have* a securityContext rarely satisfy all four mandated fields. Rendered counts (`runAsNonRoot:true / readOnlyRootFilesystem:true / drop:ALL / seccomp RuntimeDefault`):

| Chart | nonroot | readOnly | dropALL | seccomp |
|---|---|---|---|---|
| excalidraw | ✓ | ✓ | ✓ | ✓ |
| openclaw | ✓ | ✓ | ✓ | ✓ |
| coder | ✗ | ✗ | ✓ | ✓ |
| affine / ghost / remnawave | ✓ | ✗ | ✓ | ✗ |
| rybbit / supabase | ✓ | ✗ | ✗ | ✗ |
| zerobyte | ✗ | ✗ | ✓ | ✗ |
| bytebase, glance, hub, metube, pangolin, stalwart, syncthing, teamcity, vault, vaultwarden, youtrack, monitoring(grafana/loki/prometheus), logging(es) | ✗ | ✗ | ✗ | ✗ |

Only `excalidraw` and `openclaw` are fully compliant. `vaultwarden` (a credential store) renders only `runAsUser: 80` — no runAsNonRoot/readOnly/caps/seccomp. `readOnlyRootFilesystem: true` is set by **zero** charts except the two compliant ones (affine even sets it explicitly `false`).
*Fix:* standardize the HELM-007 securityContext (pod + container) across all charts; add `emptyDir` mounts for `/tmp` and cache dirs.

**H-2 — Kubernetes `Secret` objects created from values (Vault-injection rule).**
13 charts ship a `templates/secret.yaml` that creates a `kind: Secret` from values, contradicting "NEVER create Kubernetes Secrets for application credentials — use Vault injection": `bytebase, youtrack, stalwart, ghost, supabase, affine, zerobyte, vaultwarden, coder, remnawave, monitoring/grafana, logging/kibana, logging/elasticsearch`. Several default to `"changeme"` when the value is unset (`bytebase` postgres-password, `zerobyte` restic-password), which silently ships a weak credential if the override is missed.
*Fix:* migrate to Vault agent injection (`vault.hashicorp.com/agent-inject` annotations) per the Secrets rule; at minimum remove `default "changeme"` fallbacks so a missing secret fails loudly.

**H-3 — Hardcoded passwords in chart values.yaml.**
`kubernetes/charts/stoat/values.yaml:91` → `password: "rabbitpass"`; `kubernetes/charts/remnawave/values.yaml:100` → `password: "change_me_metrics"`. Plaintext credential defaults checked into git.
*Fix:* remove; source via SOPS/Vault.

**H-4 — TeamCity agent mounts the Docker socket via hostPath.**
`kubernetes/charts/teamcity/templates/agent-deployment.yaml:60-63` mounts `hostPath: /var/run/docker.sock`. Access to the node Docker socket is equivalent to root on the node and bypasses Pod Security entirely.
*Fix:* use a rootless/sidecar build approach (e.g. Kaniko/BuildKit) or document and isolate this agent; never co-schedule with sensitive workloads.

**H-5 — Missing `pdb.yaml`.**
`kubernetes/charts/n8n/templates/` and `kubernetes/charts/zerobyte/templates/` have no `pdb.yaml` (HELM-009). (`zerobyte` is a backup job — arguably acceptable; `n8n` runs as a long-lived service and should have one.)
*Fix:* `kubernetes/scripts/add-pdb.sh n8n` (and zerobyte if it runs HA).

**H-6 — `gitlab-ingress` chart missing nearly all mandatory templates.**
`kubernetes/charts/gitlab-ingress/templates/` contains only `_helpers.tpl, ingressroute.yaml, middleware.yaml, tests/`. Missing SA, rbac, networkpolicy, servicemonitor, pdb. It deploys no pods (Traefik IngressRoute + Middleware helper only), so this is a partial false-positive against HELM-004…009, but the rules make no exception.
*Fix:* either document an explicit exemption for pod-less helper charts in `.docs/arch-rules.md`, or add the templates for consistency.

**H-7 — No CI security gate; CICD-001 not satisfied.**
`.github/workflows/` contains only `build-docs.yaml`, `labels.yaml`, and `release.yaml` (the latter runs `helm lint` only). CICD-001 mandates a validation pipeline with `helm lint`, `kubeval`, `ansible-lint`, `trivy config`, and `conftest` (OPA). `.pre-commit-config.yaml` is good (gitleaks, kubeval `--strict`, helm-lint, ansible-lint/syntax, shellcheck, yamllint, detect-private-key, SOPS decryption check) **but it is local-only and unenforced** — none of it runs in GitHub Actions, and `kubeval`/`conftest`/`trivy` are not installed in CI. Also, the pre-commit `ansible-syntax` hook references `inventory/hosts.ini` (gitignored / not present), so it fails on a clean clone.
*Fix:* add `.github/workflows/validate.yml` mirroring the pre-commit gate and installing kubeval, conftest, and trivy; point the ansible syntax check at `hosts.example.ini`.

### MEDIUM

**M-1 — `logging` and `elasticsearch` run init/daemon containers as root / privileged.**
`logging/elasticsearch/statefulset.yaml:64,69` initContainers run `privileged: true` + `runAsUser: 0` (sysctl `vm.max_map_count`) and `runAsUser: 0` (chown). `logging/filebeat/daemonset.yaml:51` runs `runAsUser: 0`. `filebeat` and `monitoring/promtail` daemonsets also use `hostNetwork: true` + `hostPath`. These are common log-shipper patterns but violate the strict securityContext rules and warrant explicit, documented justification and the narrowest possible scope. (The sysctl init is gated by `sysctlInit.enabled`.)
*Fix:* gate privileged init behind a flag (done), drop to specific capabilities where possible, and document the exception.

**M-2 — TeamCity filename typo / non-canonical workload name.**
`kubernetes/charts/teamcity/templates/server-deploymnt.yaml` (sic) — there is no canonical `deployment.yaml`. Functionally renders, but breaks convention/grep-ability.
*Fix:* rename to `server-deployment.yaml`.

**M-3 — `.beads/config.yaml` references a non-existent path.**
References `/Users/zeizel/.beads-planning` (another user's home). Breaks `bd` tooling for this repo's owner.
*Fix:* correct or remove the stale path.

### LOW

**L-1 — `.gitignore` too narrow for secrets.** Excludes `.env*` and `ansible/inventory/hosts.ini` (good) but not `*.bak` or `*_plain.yaml`. (See B-1/B-2.)

**L-2 — `stoat` uses one `master` tag among otherwise date-pinned tags** (`values.yaml:111`). Folded into B-3 but called out as a partial pin.

**L-3 — Resource limits:** all workloads template `resources` via `toYaml .Values.resources`; spot-checks (vaultwarden, youtrack) confirm real `limits`/`requests` render. No missing-limits violations found, but values completeness was not audited per-chart — recommend a rendered-resource audit in CI.

**Good / compliant (no action):**
- All 28 charts pass `helm lint` cleanly.
- `kubernetes/envs/k8s/secrets/_all.yaml` is properly SOPS/AES256-encrypted; `.sops.yaml` rule is correct.
- Ansible inventory: only `hosts.example.ini` is tracked; real `hosts.ini` is gitignored and absent — **compliant**.
- `group_vars/all/`: `vault.example.yml` (template) and an encrypted `vault.yml.bak`; no plaintext secrets found in `vars.yml`.
- `namespaces` chart applies namespace-level **default-deny** NetworkPolicies (HELM-006.1) in `networkpolicies.yaml`; the empty `networkpolicy.yaml` is an intentional, documented stub.
- No RBAC `*`-verb/`*`-resource or `cluster-admin` grants found in any `rbac.yaml`.
- No `allowPrivilegeEscalation: true` and no hardcoded private IPs found.

---

## Chart Compliance Table (28 charts × 7 mandatory templates)

Legend: ✓ present · ✗ missing · N/A no pods (helper/infra) · *=in component subdirs

| Chart | SA | rbac | netpol | svcMon | workload | pdb | tests |
|---|---|---|---|---|---|---|---|
| affine | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| bytebase | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| coder | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **consul** | ✓ | **✗** | **✗** | ✓ | ✓(sts) | **✗** | ✓ |
| excalidraw | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ghost | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **gitlab-ingress** | **✗** | **✗** | **✗** | **✗** | N/A | **✗** | ✓ |
| glance | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| hub | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| logging | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | ✓ |
| metube | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| monitoring | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | ✓ |
| **n8n** | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |
| namespaces | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | ✓ |
| openclaw | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pangolin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| remnawave | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| rybbit | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | ✓ |
| stalwart | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| stoat | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | ✓ |
| supabase | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | ✓ |
| syncthing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| teamcity | ✓ | ✓ | ✓ | ✓ | ✓*† | ✓ | ✓ |
| vault | ✓ | ✓ | ✓ | ✓ | ✓(sts) | ✓ | ✓ |
| vaultwarden | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| vert | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| youtrack | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **zerobyte** | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |

† teamcity workload file is misnamed `server-deploymnt.yaml` (M-2).
**Template-presence failures:** consul (rbac, netpol, pdb), gitlab-ingress (SA, rbac, netpol, svcMon, pdb), n8n (pdb), zerobyte (pdb). Note: template *presence* ≠ securityContext *correctness* — see H-1, which affects most charts in the table.

---

## helm lint Results

All **28** custom charts: **PASS** — `1 chart(s) linted, 0 chart(s) failed`, zero `[WARNING]`/`[ERROR]` lines. `kubeval` schema validation **could not be run (not installed)** — must be enforced in CI (H-7).

---

## Prioritized Remediation Checklist (must clear for GO)

- [ ] **B-1** Remove `kubernetes/envs/k8s/secrets/_all_plain.yaml` from git; gitignore `*_plain.yaml`.
- [ ] **B-2** Remove `ansible/group_vars/all/vault.yml.bak` from git; gitignore `*.bak`.
- [ ] **B-3** Pin all images to immutable tags; delete `latest`/`master`/`stable` from the 9 release `.gotmpl`s and 8 `values.yaml`s.
- [ ] **B-4** consul: add `rbac.yaml`, `networkpolicy.yaml`, `pdb.yaml` (use `kubernetes/scripts/add-rbac.sh`, `add-networkpolicy.sh`, `add-pdb.sh`) + securityContext.
- [ ] **B-5** Add full securityContext to consul, n8n, vert, all 7 stoat components, logging kibana+logstash, monitoring promtail.
- [ ] **H-1** Standardize the HELM-007 securityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp RuntimeDefault, allowPrivilegeEscalation:false) across all charts; add `emptyDir` for writable paths.
- [ ] **H-2** Replace value-based `kind: Secret` (13 charts) with Vault injection; remove `default "changeme"` fallbacks.
- [ ] **H-3** Remove hardcoded passwords in `stoat/values.yaml` and `remnawave/values.yaml`.
- [ ] **H-4** Eliminate / isolate the TeamCity Docker-socket hostPath mount.
- [ ] **H-5** Add `pdb.yaml` to n8n (`add-pdb.sh`).
- [ ] **H-6** Add mandatory templates to gitlab-ingress or document a pod-less-helper exemption in arch-rules.
- [ ] **H-7** Add `.github/workflows/validate.yml` mirroring pre-commit; install kubeval + conftest + trivy in CI.
- [ ] **M-1/M-2/M-3** Document logging privileged init exceptions; rename `server-deploymnt.yaml`; fix `.beads/config.yaml` path.

---

## Recommendations

1. **CI parity:** create `.github/workflows/validate.yml` that runs gitleaks, `helm lint`, `helm template | kubeval --strict`, `conftest test` (OPA policies for securityContext/NetworkPolicy/`:latest`), `trivy config`, and `ansible-lint` — mirroring `.pre-commit-config.yaml`. Install `kubeval`, `conftest`, and `trivy` in the runner (none are available locally today).
2. **Secrets hygiene:** delete `_all_plain.yaml` and `vault.yml.bak` from history (consider `git filter-repo` if any real value ever existed); broaden `.gitignore` (`*.bak`, `*_plain.yaml`). Keep SOPS/`_all.yaml` as the single source.
3. **Policy-as-code:** add Conftest/OPA rules that fail the build on `:latest`/mutable tags, missing `runAsNonRoot`/`readOnlyRootFilesystem`/`drop: [ALL]`/seccomp, value-based `kind: Secret`, and `hostPath`/`privileged`/`hostNetwork` without an allow-list annotation.
4. **securityContext template helper:** factor the mandated pod/container securityContext into `_helpers.tpl` so every chart inherits a compliant default and deviations are explicit.
5. **Vault adoption:** complete the migration to Vault agent injection — adoption is currently partial (13 charts still mint their own Secrets).
6. **Fix the pre-commit `ansible-syntax` hook** to target `hosts.example.ini` so it works on clean clones.
