#!/bin/bash

# Usage: ./deploy.sh <environment> <domain-name>
# Example: ./deploy.sh production prospx.io

set -e

# Default values
ENV=${1:-production}
DOMAIN=${2:-prospx.io}
PROJECT_ID="cs-poc-alax5vq9yuwvzv0imv8i5ks"

# Confirm settings
echo "Deploying to $ENV environment with domain $DOMAIN"
echo "Project ID: $PROJECT_ID"
echo "Press Enter to continue or Ctrl+C to cancel"
read

# Update domain in ingress configuration
sed -i "s/prospx.io/$DOMAIN/g" k8s-modified/base/ingress.yaml
sed -i "s/prospx.io/$DOMAIN/g" k8s-modified/development/client-configmap.yaml
sed -i "s/prospx.io/$DOMAIN/g" k8s-modified/development/server-configmap.yaml
sed -i "s/prospx.io/$DOMAIN/g" k8s-modified/production/client-configmap.yaml
sed -i "s/prospx.io/$DOMAIN/g" k8s-modified/production/server-configmap.yaml

# Build and push Docker images
echo "Building and pushing images..."

# Client image
cd client
docker build \
  --build-arg VITE_URL=https://api.$DOMAIN \
  --build-arg VITE_LINKEDIN_REDIRECT_URI=https://$DOMAIN/check-auth \
  --build-arg VITE_GOOGLE_REDIRECT_URI=https://$DOMAIN/check-auth \
  -t gcr.io/$PROJECT_ID/mern-client:$ENV .
docker push gcr.io/$PROJECT_ID/mern-client:$ENV

# Server image
cd ../server
docker build -t gcr.io/$PROJECT_ID/mern-server:$ENV .
docker push gcr.io/$PROJECT_ID/mern-server:$ENV
cd ..

# Deploy to GKE
echo "Deploying to GKE..."
kubectl apply -k k8s-modified/$ENV

# Wait for deployments to be ready
echo "Waiting for deployments to be ready..."
kubectl rollout status deployment/client
kubectl rollout status deployment/server

# Get ingress IP (may take a few minutes to provision)
echo "Waiting for ingress to be ready (this may take a few minutes)..."
INGRESS_IP=""
while [ -z "$INGRESS_IP" ]; do
  INGRESS_IP=$(kubectl get ingress mern-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
  if [ -z "$INGRESS_IP" ]; then
    echo "Waiting for ingress IP..."
    sleep 30
  fi
done

echo "Ingress IP: $INGRESS_IP"
echo "===== DEPLOYMENT COMPLETED ====="
echo "Add the following DNS records:"
echo "$DOMAIN A $INGRESS_IP"
echo "api.$DOMAIN A $INGRESS_IP"
echo "You can now access your application at: https://$DOMAIN"
echo "API is available at: https://api.$DOMAIN"