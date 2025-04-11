# Define domain and cluster details
$DOMAIN = "prospx.io"
$PROJECT_ID = "cs-poc-alax5vq9yuwvzv0imv8i5ks"
$CLUSTER_NAME = "mern-cluster"
$ZONE = "us-central1-a"

# Configure gcloud and kubectl to connect to your cluster
gcloud config set project $PROJECT_ID
gcloud container clusters get-credentials $CLUSTER_NAME --zone $ZONE --project $PROJECT_ID

# Get the IP address
$INGRESS_IP = kubectl get ingress mern-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

if (-not $INGRESS_IP) {
  Write-Host "Error: Could not get ingress IP. Make sure your ingress is deployed and running."
  exit 1
}

Write-Host "Your ingress IP is: $INGRESS_IP"
Write-Host "Please add the following DNS records to your domain provider:"
Write-Host "  - Type: A, Name: @, Value: $INGRESS_IP"
Write-Host "  - Type: A, Name: api, Value: $INGRESS_IP"
Write-Host ""
Write-Host "After setting up DNS records, wait a few minutes for propagation."
Write-Host "Press Enter when DNS records are set up..."
Read-Host

# Create managed SSL certificate
@"
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: mern-cert-new
spec:
  domains:
  - $DOMAIN
  - api.$DOMAIN
"@ | Out-File -FilePath ssl-certificate-new.yaml -Encoding utf8

kubectl apply -f ssl-certificate.yaml

# Update ingress to use the certificate
@"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mern-ingress
  annotations:
    kubernetes.io/ingress.class: "gce"
    kubernetes.io/ingress.global-static-ip-name: "mern-app-ip"
    networking.gke.io/managed-certificates: "mern-cert"
"@ | Out-File -FilePath ingress-update.yaml -Encoding utf8

kubectl patch ingress mern-ingress --patch (Get-Content -Raw ingress-update.yaml)

Write-Host "SSL certificate has been requested. It may take up to 60 minutes for the certificate to be provisioned."
Write-Host "You can check the status with: kubectl describe managedcertificate mern-cert"