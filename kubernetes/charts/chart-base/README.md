# chart-base (Helm library chart)

Reusable named templates so app charts stay thin and compliant by default.
Provides: `chart-base.deployment`, `.service`, `.serviceaccount`, `.rbac`,
`.networkpolicy`, `.servicemonitor`, `.pdb`, `.configmap`, `.httproute`
(Gateway API), `.tests`, plus name/label/securityContext helpers. Security
context (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp RuntimeDefault),
standard labels, the `prometheus: kube-prometheus` ServiceMonitor label, and
Traefik/cert-manager/Authentik wiring are baked in.

## Use it

1. Add the dependency to the consumer `Chart.yaml`:

   ```yaml
   dependencies:
     - name: chart-base
       version: 0.1.0
       repository: file://../chart-base
   ```
   then `helm dependency build kubernetes/charts/<svc>`.

2. Render components from one-line templates, e.g.
   `templates/deployment.yaml`:

   ```yaml
   {{- include "chart-base.deployment" . }}
   ```
   Repeat for service/serviceaccount/rbac/networkpolicy/servicemonitor/pdb/
   httproute/tests.

3. Populate the consumer `values.yaml` per the contract in this chart's
   `values.yaml`.

## Routing (Gateway API)

`chart-base.httproute` emits an `HTTPRoute` attached to the shared cluster
`Gateway` (defined in the `namespaces` chart, fronted by Traefik's
`kubernetesGateway` provider). It replaces per-service `Ingress`. Authentik SSO
is preserved via an `ExtensionRef` filter to the Traefik forward-auth Middleware.

## Migration status

- ✅ library complete and validated (`helm template` renders all 10 components).
- ✅ shared `Gateway`/`GatewayClass` in `charts/namespaces` (`gateway.enabled`).
- ✅ Traefik `kubernetesGateway` provider enabled (`releases/traefik.yaml.gotmpl`).
- ✅ reference conversion: `charts/glance` (Ingress → HTTPRoute).
- ⏳ remaining 23 charts: convert `templates/ingress.yaml` → `httproute.yaml`
  (pattern = `charts/glance/templates/httproute.yaml`) and, for simple
  single-Deployment charts, adopt `chart-base` includes. Tracked in beads.
