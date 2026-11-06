param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'Google Cloud CLI (gcloud) is required. Install it, run gcloud auth login, then retry.'
}

$token = (gcloud auth print-access-token).Trim()
if (-not $token) { throw 'Could not obtain a Google Cloud access token. Run gcloud auth login.' }

$uri = "https://identitytoolkit.googleapis.com/admin/v2/projects/$ProjectId/config?updateMask=mfa"
$headers = @{
  Authorization = "Bearer $token"
  'X-Goog-User-Project' = $ProjectId
}
$body = @{
  mfa = @{
    providerConfigs = @(
      @{
        state = 'ENABLED'
        totpProviderConfig = @{ adjacentIntervals = 5 }
      }
    )
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body
Write-Host 'TOTP MFA is enabled at the Firebase project level.' -ForegroundColor Green
