# Notesnook

Manual deploy

```bash
helm install notesnook charts/notesnook -n notesnook --create-namespace -f values.yaml
```

Init replica set mongo

```bash
kubectl exec -it -n notesnook deployment/mongo -- mongosh

# mongosh
rs.initiate({_id:'rs0',members:[{_id:0,host:"mongo:27017"}]})
```
