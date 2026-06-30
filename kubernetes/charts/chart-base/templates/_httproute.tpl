{{/*
chart-base.httproute — Gateway API HTTPRoute attached to the shared cluster
Gateway (Traefik GatewayClass). Replaces the per-chart Ingress. Authentik SSO is
preserved via an ExtensionRef filter to the Traefik forward-auth Middleware.

Values contract (.Values.route):
  enabled: true
  host: app.example.com            # single host, or:
  hostnames: [a.example.com, ...]
  gateway:
    name: shared-gateway           # shared Gateway resource
    namespace: ingress
    sectionName: websecure         # listener name (optional)
  authentik:
    enabled: false
    middleware: authentik-forward-auth   # Traefik Middleware (same namespace)
*/}}
{{- define "chart-base.httproute" -}}
{{- if .Values.route.enabled }}
{{- $gw := .Values.route.gateway | default dict }}
{{- $authentik := .Values.route.authentik | default dict }}
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
spec:
  parentRefs:
    - name: {{ $gw.name | default "shared-gateway" }}
      namespace: {{ $gw.namespace | default "ingress" }}
      {{- with $gw.sectionName }}
      sectionName: {{ . }}
      {{- end }}
  hostnames:
    {{- if .Values.route.hostnames }}
    {{- range .Values.route.hostnames }}
    - {{ . | quote }}
    {{- end }}
    {{- else }}
    - {{ .Values.route.host | quote }}
    {{- end }}
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      {{- if $authentik.enabled }}
      filters:
        - type: ExtensionRef
          extensionRef:
            group: traefik.io
            kind: Middleware
            name: {{ $authentik.middleware | default "authentik-forward-auth" }}
      {{- end }}
      backendRefs:
        - name: {{ include "chart-base.fullname" . }}
          port: {{ .Values.service.port }}
{{- end }}
{{- end }}

{{- define "chart-base.configmap" -}}
{{- if .Values.configMap.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
data:
  {{- toYaml .Values.configMap.data | nindent 2 }}
{{- end }}
{{- end }}
