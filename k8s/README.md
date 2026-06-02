# Kubernetes Deployment

These manifests provide a starter Kubernetes deployment for ZTF-Orchestrator with
PostgreSQL-backed state.

Apply the manifests in order:

```bash
kubectl apply -f namespace.yaml
kubectl apply -f secret.example.yaml
kubectl apply -f configmap.yaml
kubectl apply -f postgres.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

Edit `secret.example.yaml` before production use. For managed PostgreSQL, omit
`postgres.yaml` and set `ZTF_DATABASE_URL` to the managed database endpoint.

The deployment intentionally uses `replicas: 1` because execution workers still run
inside the Flask process. Increase replicas only after moving executions to an
external worker/job queue.
