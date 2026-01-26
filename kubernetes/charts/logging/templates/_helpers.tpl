{{/*
Generate initial master nodes list for Elasticsearch cluster.
Produces "elasticsearch-0,elasticsearch-1,elasticsearch-2" for replicaCount=3.
*/}}
{{- define "elasticsearch.initialMasterNodes" -}}
{{- $nodes := list -}}
{{- range $i := until (int .Values.elasticsearch.replicaCount) -}}
{{- $nodes = append $nodes (printf "elasticsearch-%d" $i) -}}
{{- end -}}
{{- join "," $nodes -}}
{{- end -}}
