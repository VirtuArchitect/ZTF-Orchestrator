# Foundation Central Appliance CoreDNS IKAT Workaround Guide

Current release marker: `v1.8.1`.

This guide describes how to apply the Nutanix-recommended CoreDNS workaround for
Standalone Foundation Central Appliance deployments that fail during AOS
pre-installation with an IKAT tunnel error.

Apply this on the **Foundation Central Appliance**, not on ZTF-Orchestrator and
not on the AHV or CVM nodes.

## Issue

The failure pattern is:

```text
IKAT tunnel to AHV is not created within 900s
```

or:

```text
CVM IKAT tunnel is not created in the expected time
```

The attached workaround patches FCA's internal CoreDNS configuration so
`*.tcpproxy.envoy.remote` resolves to `192.168.1.2`, then installs a systemd
service to persist the patch across FCA appliance reboots.

## Safety Notes

- Take a VM snapshot or backup of the Standalone FCA appliance first.
- Avoid applying the workaround during an active cluster deployment unless
  Nutanix Professional Services has advised you to do so.
- The script is intended for the FCA appliance's internal k3d/k3s environment.

## Step-By-Step Procedure

### 1. Copy the Script to the FCA Appliance

From your workstation or jump host:

```bash
scp patch_coredns.sh nutanix@<fca-appliance-host>:/home/nutanix/patch_coredns.sh
```

### 2. SSH to the FCA Appliance

```bash
ssh nutanix@<fca-appliance-host>
```

### 3. Prepare the Script

```bash
cd /home/nutanix
chmod +x patch_coredns.sh
```

If the file was copied from Windows, clean line endings:

```bash
sed -i 's/\r$//' patch_coredns.sh
```

### 4. Confirm FCA Internals Are Running

```bash
systemctl status docker --no-pager
docker ps
k3d cluster list
kubectl version --request-timeout=5s
kubectl -n kube-system get deployment coredns
```

Expected:

- Docker is running.
- The FCA `fccluster` k3d cluster exists.
- `kubectl` can connect.
- The `coredns` deployment exists in `kube-system`.

### 5. Back Up the Current CoreDNS ConfigMap

```bash
mkdir -p ~/coredns-backup
kubectl -n kube-system get configmap coredns -o yaml > ~/coredns-backup/coredns-before-$(date +%Y%m%d-%H%M%S).yaml
```

### 6. Run the Workaround Installer

Run the script as the `nutanix` user. The script will request `sudo` where
required.

```bash
./patch_coredns.sh 2>&1 | tee ~/patch_coredns_run.log
```

The script should:

- Patch the current CoreDNS manifest if FCA's k3d cluster is running.
- Install `fc-ikat-manifest-patch-boot.service`.
- Add boot-time persistence so the CoreDNS patch is re-applied after FCA reboot.

### 7. Verify the CoreDNS Patch

```bash
kubectl -n kube-system get configmap coredns -o jsonpath='{.data.Corefile}'
```

Confirm this block exists:

```text
template IN A {
  match "^(.+)\.tcpproxy\.envoy\.remote\.$"
  answer "{{ .Name }} 60 IN A 192.168.1.2"
  fallthrough
}
```

### 8. Restart CoreDNS if Needed

If the ConfigMap has changed but CoreDNS has not picked it up:

```bash
kubectl -n kube-system rollout restart deployment/coredns
kubectl -n kube-system rollout status deployment/coredns --timeout=120s
```

### 9. Test DNS Resolution

Run a temporary lookup from inside the FCA Kubernetes environment:

```bash
kubectl run dns-test --rm -it --restart=Never --image=busybox:1.36 -- nslookup test.tcpproxy.envoy.remote
```

Expected result:

```text
Name:      test.tcpproxy.envoy.remote
Address 1: 192.168.1.2
```

### 10. Confirm the Persistence Service

```bash
sudo systemctl status fc-ikat-manifest-patch-boot.service --no-pager
sudo systemctl is-enabled fc-ikat-manifest-patch-boot.service
```

View service logs:

```bash
sudo journalctl -u fc-ikat-manifest-patch-boot.service -n 100 --no-pager
```

View boot patch logs:

```bash
tail -n 100 /home/nutanix/data/logs/appliance_setup_logs/fc-ikat-boot-patch.log
```

### 11. Retry the Cluster Deployment

Once CoreDNS resolution is confirmed, retry the cluster deployment from
ZTF-Orchestrator or from FCA, depending on where you want to initiate it.

For ZTF-Orchestrator, the expected behavior is that the workflow submits the
Lifecycle deployment request and reports FCA handoff acceptance. FCA then owns
the long-running imaging, AOS installation, IKAT validation, and cluster
formation workflow.

## Rollback

Disable and remove the persistence service:

```bash
sudo systemctl stop fc-ikat-manifest-patch-boot.service
sudo systemctl disable fc-ikat-manifest-patch-boot.service
sudo rm /etc/systemd/system/fc-ikat-manifest-patch-boot.service
sudo systemctl daemon-reload
```

Restore the saved CoreDNS ConfigMap backup if required:

```bash
kubectl apply -f ~/coredns-backup/<backup-file>.yaml
kubectl -n kube-system rollout restart deployment/coredns
kubectl -n kube-system rollout status deployment/coredns --timeout=120s
```

## Useful Troubleshooting Commands

Check CoreDNS pods:

```bash
kubectl -n kube-system get pods -l k8s-app=kube-dns
```

Inspect CoreDNS logs:

```bash
kubectl -n kube-system logs deployment/coredns --tail=100
```

Check the FCA k3d server container:

```bash
docker ps --filter "name=k3d-fccluster-server-0"
```

Check whether the manifest inside the k3d container contains the workaround:

```bash
CONTAINER_ID=$(docker ps --filter "name=k3d-fccluster-server-0" --format "{{.ID}}" | head -1)
docker exec "$CONTAINER_ID" grep -A 8 "template IN A" /var/lib/rancher/k3s/server/manifests/coredns.yaml
```

## Boundary

This workaround addresses FCA's internal CoreDNS/IKAT resolution path. It does
not change the ZTF-Orchestrator workflow payload, credentials, or Lifecycle API
submission logic.
