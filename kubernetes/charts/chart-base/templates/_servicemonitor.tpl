{{- define "chart-base.servicemonitor" -}}
{{- if .Values.serviceMonitor.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
    prometheus: kube-prometheus
spec:
  selector:
    matchLabels:
      {{- include "chart-base.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: http
      path: {{ .Values.serviceMonitor.path | default "/metrics" }}
      interval: {{ .Values.serviceMonitor.interval | default "30s" }}
{{- end }}
{{- end }}

{{- define "chart-base.pdb" -}}
{{- if .Values.pdb.enabled }}
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "chart-base.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
spec:
  {{- if .Values.pdb.minAvailable }}
  minAvailable: {{ .Values.pdb.minAvailable }}
  {{- else }}
  maxUnavailable: {{ .Values.pdb.maxUnavailable | default 1 }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "chart-base.selectorLabels" . | nindent 6 }}
{{- end }}
{{- end }}

{{- define "chart-base.tests" -}}
apiVersion: v1
kind: Pod
metadata:
  name: "{{ include "chart-base.fullname" . }}-test-connection"
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "chart-base.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": test
spec:
  restartPolicy: Never
  securityContext:
    {{- include "chart-base.podSecurityContext" . | nindent 4 }}
  containers:
    - name: wget
      image: busybox:1.36
      securityContext:
        {{- include "chart-base.securityContext" . | nindent 8 }}
      command: ["wget"]
      args: ["-qO-", "http://{{ include "chart-base.fullname" . }}:{{ .Values.service.port }}"]
{{- end }}
