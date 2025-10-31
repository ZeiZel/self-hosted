{{- define "minio.name" -}}
minio
{{- end }}

{{- define "minio.fullname" -}}
{{ include "minio.name" . }}
{{- end }}
