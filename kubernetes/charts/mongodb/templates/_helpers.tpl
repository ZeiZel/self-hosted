{{- define "mongodb.initReplicaSet" -}}
  rs.initiate({
_id: "{{ .Values.mongodb.replicaSet }}",
members: [
   { _id: 0, host: "mongodb-0.mongodb-headless.{{ .Values.namespace }}.svc.cluster.local:27017", priority: 10 },
   { _id: 1, host: "mongodb-1.mongodb-headless.{{ .Values.namespace }}.svc.cluster.local:27017", priority: 5 },
   { _id: 2, host: "mongodb-2.mongodb-headless.{{ .Values.namespace }}.svc.cluster.local:27017", priority: 3 }
    {{- if .Values.arbiter.enabled }}
  ,{ _id: 3, host: "mongodb-arbiter-0.mongodb-arbiter-headless.{{ .Values.namespace }}.svc.cluster.local:27017", arbiterOnly: true }
    {{- end }}
]
})
{{- end }}
