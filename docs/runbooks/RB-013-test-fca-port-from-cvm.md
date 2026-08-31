# RB-013: Test FCA Port 8000 From a CVM

Use this check when validating whether a Controller VM can reach Foundation
Central Appliance on TCP port `8000`.

## Inputs

- FCA IP address or FQDN.
- SSH access to a CVM on the target Nutanix cluster.

## Procedure

1. SSH to the CVM.

   ```bash
   ssh nutanix@<CVM_IP>
   ```

2. Confirm basic routing to the FCA.

   ```bash
   ping -c 3 <FCA_IP_OR_FQDN>
   ip route get <FCA_IP_OR_FQDN>
   ```

3. Test TCP port `8000`.

   ```bash
   nc -vz <FCA_IP_OR_FQDN> 8000
   ```

4. If `nc` is not installed, use bash TCP redirection.

   ```bash
   timeout 5 bash -c '</dev/tcp/<FCA_IP_OR_FQDN>/8000' && echo "open" || echo "closed or unreachable"
   ```

5. If FCA serves HTTP or HTTPS on the port, test the application response.

   ```bash
   curl -vk --connect-timeout 5 https://<FCA_IP_OR_FQDN>:8000/
   ```

## Result Interpretation

| Result | Meaning |
|---|---|
| `succeeded`, `open`, or HTTP/TLS response | The CVM can reach FCA on TCP `8000`. |
| `connection refused` | The FCA is reachable, but nothing is listening on port `8000` or the service is rejecting connections. |
| Timeout | Routing, firewall, ACL, security policy, or an intermediate network path is likely blocking access. |
| DNS failure | The CVM cannot resolve the FCA FQDN; retry with the FCA IP or fix DNS. |

## Evidence to Capture

Record the CVM hostname, FCA target, command output, timestamp, and whether the
test was run by IP address or FQDN.
