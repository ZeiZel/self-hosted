{{/*
chart-base.networkpolicy — default-deny with explicit allows (HELM-006):
ingress from the ingress namespace (Traefik/Gateway), DNS egress always, and
optional DB egress to the db namespace.
*/}}
{{- define "chart-base.networkpolicy" -}}
{{- if .Values.networkPolicy.enabled }}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
spec:
  podSelector:
    matchLabels:
      {{- include "chart-base.selectorLabels" . | nindent 6 }}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress
      ports:
        - protocol: TCP
          port: {{ .Values.service.targetPort | default .Values.service.port }}
    {{- with .Values.networkPolicy.extraIngress }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
  egress:
    # DNS
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    {{- if .Values.networkPolicy.allowDB }}
    - to:
        - namespaceSelector:
            matchLabels:
              name: db
    {{- end }}
    {{- with .Values.networkPolicy.extraEgress }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
{{- end }}
{{- end }}
