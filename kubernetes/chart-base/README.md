# chart-base (generic application chart)

A single `type: application` chart used as a **subchart** by every self-hosted
service. App charts keep an **empty `templates/`** dir and declare chart-base as a
dependency; chart-base renders all of their resources from values nested under the
`chart-base:` key. Security context (runAsNonRoot, readOnlyRootFilesystem, drop
ALL, seccomp RuntimeDefault), standard labels, the `prometheus: kube-prometheus`
ServiceMonitor label, and Traefik/cert-manager/Authentik wiring are baked in.
Resource names derive from the Helm release name (= the helmfile service name).

## How an app chart uses it

`charts/<svc>/Chart.yaml`:
```yaml
dependencies:
  - name: chart-base
    version: 0.1.0
    repository: file://../../chart-base
```
`charts/<svc>/templates/` contains only `.gitkeep`. `charts/<svc>/values.yaml` puts
everything under `chart-base:`. Helmfile runs `helm dependency build` automatically
at apply/template time (it vendors chart-base into `charts/<svc>/charts/`, which is
gitignored). See `charts/glance/` for the reference conversion.

## Value schema (under `chart-base:`)

`workloads[]` (Deployment / StatefulSet / DaemonSet / Job / CronJob, with
`containers[]` + `initContainers[]`, env, ports, probes, resources, volumes,
`volumeClaimTemplates`, affinity, podAnnotations), `services[]`, `configMaps[]`
(inline `data`), `secrets[]`, `pvcs[]`, `serviceAccount`/`serviceAccounts[]`,
`rbac{rules,clusterRules,extra}`, `networkPolicy`, `serviceMonitor`, `pdb`, `hpa`,
`routing{httpRoutes[],ingresses[],traefik{ingressRoutes,middlewares}}`,
`extraManifests[]` (raw escape hatch), `tests`. See `values.yaml` for full defaults.

## Routing

Default routing is **Gateway API HTTPRoute** attached to the shared cluster
`Gateway` (in the `namespaces` chart, fronted by Traefik's `kubernetesGateway`
provider). Authentik SSO is preserved via an `ExtensionRef` filter to the Traefik
forward-auth Middleware. Plain Ingress and raw Traefik CRDs are available via
`routing.ingresses` / `routing.traefik` / `extraManifests`.

## Migration status

- ✅ chart-base is a generic application subchart (validated: renders all kinds).
- ✅ **all 26 app charts emptied** — affine, bytebase, coder, consul, excalidraw,
  ghost, glance, hub, logging, metube, monitoring, n8n, openclaw, pangolin,
  remnawave, rybbit, stalwart, stoat, supabase, syncthing, teamcity, vault,
  vaultwarden, vert, youtrack, zerobyte. Each `templates/` holds only `.gitkeep`.
- ⚪ **exempt:** `namespaces` (cluster bootstrap: Namespaces/ClusterIssuers/Gateway/
  Certificates/NetworkPolicies) and `gitlab-ingress` (Traefik routing only) keep
  their own templates.
- ℹ️ chart-base enforces the mandatory securityContext on every pod. A few apps that
  write outside their volumes set `securityContext.readOnlyRootFilesystem: false`
  (or add an emptyDir) — smoke-test before relying on read-only root.
