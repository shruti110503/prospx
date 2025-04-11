#!/bin/bash

# Usage: ./setup-ssl.sh <domain-name>
# Example: ./setup-ssl.sh prospx.io

DOMAIN=${1:-prospx.io}
PROJECT_ID="cs-poc-alax5vq9yuwvzv0imv8i5ks"

# Get the IP address
INGRESS_IP=$(kubectl get ingress mern-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

if [ -z "$INGRESS_IP" ]; then
  echo "Error: Could not get ingress IP. Make sure your ingress is deployed and running."
  exit 1
fi

echo "Your ingress IP is: $INGRESS_IP"
echo "Please add the following DNS records to your domain provider:"
echo "  - Type: A, Name: @, Value: $INGRESS_IP"
echo "  - Type: A, Name: api, Value: $INGRESS_IP"
echo ""
echo "After setting up DNS records, wait a few minutes for propagation."
echo "Press Enter when DNS records are set up..."
read

# Create managed SSL certificate
cat > ssl-certificate.yaml << EOL
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: mern-cert
spec:
  domains:
  - $DOMAIN
  - api.$DOMAIN
EOL

kubectl apply -f ssl-certificate.yaml

# Update ingress to use the certificate
cat > ingress-update.yaml << EOL
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mern-ingress
  annotations:
    kubernetes.io/ingress.class: "gce"
    kubernetes.io/ingress.global-static-ip-name: "mern-app-ip"
    networking.gke.io/managed-certificates: "mern-cert"
EOL

kubectl patch ingress mern-ingress --patch "$(cat ingress-update.yaml)"

echo "SSL certificate has been requested. It may take up to 60 minutes for the certificate to be provisioned."
echo "You can check the status with: kubectl describe managedcertificate mern-cert"