{{/*
chart-base.containers — render a list of container specs.
Arg: dict "top" $ "list" <containers>.
Each container: name, image, imagePullPolicy, command, args, env, envFrom, ports,
resources, securityContext (override), volumeMounts, livenessProbe, readinessProbe,
startupProbe, lifecycle, workingDir.
*/}}
{{- define "chart-base.containers" -}}
{{- $top := .top -}}
{{- range .list }}
- name: {{ .name }}
  image: {{ .image | quote }}
  imagePullPolicy: {{ .imagePullPolicy | default "IfNotPresent" }}
  {{- with .command }}
  command:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .args }}
  args:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .workingDir }}
  workingDir: {{ . }}
  {{- end }}
  {{- with .env }}
  env:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .envFrom }}
  envFrom:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .ports }}
  ports:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  securityContext:
    {{- if .securityContext }}
    {{- toYaml .securityContext | nindent 4 }}
    {{- else }}
    {{- include "chart-base.securityContext" $top | nindent 4 }}
    {{- end }}
  {{- with .livenessProbe }}
  livenessProbe:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .readinessProbe }}
  readinessProbe:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .startupProbe }}
  startupProbe:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .lifecycle }}
  lifecycle:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .resources }}
  resources:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  {{- with .volumeMounts }}
  volumeMounts:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end }}
{{- end }}

{{/*
chart-base.podSpec — render a pod spec body (no apiVersion/kind).
Arg: dict "top" $ "w" <workload>.
*/}}
{{- define "chart-base.podSpec" -}}
{{- $top := .top -}}
{{- $w := .w -}}
serviceAccountName: {{ $w.serviceAccountName | default (include "chart-base.serviceAccountName" $top) }}
securityContext:
  {{- if $w.podSecurityContext }}
  {{- toYaml $w.podSecurityContext | nindent 2 }}
  {{- else }}
  {{- include "chart-base.podSecurityContext" $top | nindent 2 }}
  {{- end }}
{{- with $w.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $w.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $w.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $w.restartPolicy }}
restartPolicy: {{ . }}
{{- end }}
{{- with $w.initContainers }}
initContainers:
  {{- include "chart-base.containers" (dict "top" $top "list" .) | nindent 2 }}
{{- end }}
containers:
  {{- include "chart-base.containers" (dict "top" $top "list" $w.containers) | nindent 2 }}
{{- with $w.volumes }}
volumes:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/*
chart-base.workloadSelectorLabels — selector labels for a workload, adding a
component label when the workload is named (so multiple workloads don't collide).
Arg: dict "top" $ "w" <workload>.
*/}}
{{- define "chart-base.workloadSelectorLabels" -}}
{{ include "chart-base.selectorLabels" .top }}
{{- if .w.name }}
app.kubernetes.io/component: {{ .w.name }}
{{- end }}
{{- end }}
