{{- define "chart-base.serviceaccount" -}}
{{- if .Values.serviceAccount.create }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "chart-base.serviceAccountName" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
automountServiceAccountToken: {{ .Values.serviceAccount.automount | default false }}
{{- end }}
{{- end }}

{{/*
Least-privilege Role + RoleBinding. Consumers may add rules via .Values.rbac.rules.
*/}}
{{- define "chart-base.rbac" -}}
{{- if .Values.rbac.create }}
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
rules:
  {{- with .Values.rbac.rules }}
  {{- toYaml . | nindent 2 }}
  {{- else }}
  []
  {{- end }}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ include "chart-base.fullname" . }}
subjects:
  - kind: ServiceAccount
    name: {{ include "chart-base.serviceAccountName" . }}
    namespace: {{ .Release.Namespace }}
{{- end }}
{{- end }}
