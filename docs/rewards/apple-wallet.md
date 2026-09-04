# Apple Wallet loyalty passes

Apple Wallet and Apple Pay are different products. Nexora uses an Apple Wallet Store Card pass for loyalty points, punch progress, tier, and a membership QR code. It does not create a payment card or call Apple Pay APIs.

Authoritative references:

- [Wallet Passes](https://developer.apple.com/documentation/walletpasses)
- [Building a Pass](https://developer.apple.com/documentation/walletpasses/building-a-pass)
- [Distributing and updating a pass](https://developer.apple.com/documentation/walletpasses/distributing-and-updating-a-pass)
- [Register a Pass for Update Notifications](https://developer.apple.com/documentation/walletpasses/register-a-pass-for-update-notifications)
- [Unregister a Pass for Update Notifications](https://developer.apple.com/documentation/walletpasses/unregister-a-pass-for-update-notifications)
- [Get the List of Updatable Passes](https://developer.apple.com/documentation/walletpasses/get-the-list-of-updatable-passes)
- [Send an Updated Pass](https://developer.apple.com/documentation/walletpasses/send-an-updated-pass)
- [Add to Apple Wallet guidelines](https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/)

## Apple Developer setup

1. In Certificates, Identifiers & Profiles, create a Pass Type Identifier beginning with `pass.`.
2. Create a Pass Type ID certificate for that identifier.
3. Export the certificate and private key securely and convert them to PEM as required by the signing library.
4. Download the current Apple Worldwide Developer Relations intermediate certificate.
5. Store base64-encoded certificate material only in the production secret manager. Never upload signing keys through tenant UI.
6. Configure the public update base URL as `https://your-domain/api/wallet/v1`.
7. Generate a base64 32-byte rewards encryption key and a strong Vercel Cron secret.

Required variables are documented in `.env.example`. The platform validates presence without logging values. Missing configuration returns a safe unavailable state and does not prevent Nexora from starting.

## Pass generation

`passkit-generator` 3.5.8 is pinned. It creates `pass.json`, SHA manifest entries, the PKCS #7 signature, and the `.pkpass` archive. The pass uses `storeCard`, a stable non-guessable serial number, tenant branding, concise fields, and an opaque membership QR value. The authenticated download route returns `application/vnd.apple.pkpass` and the approved Apple badge links to it.

## Update service

The pass includes `webServiceURL` and a strong `authenticationToken`. Nexora stores a hash for comparison and an AES-256-GCM ciphertext so the token can remain stable when regenerating the same pass.

The service implements Apple's current `v1/devices/.../registrations/...` register, unregister, and updated-serial endpoints; the `v1/passes/...` updated-pass endpoint; and `v1/log`. Device library identifiers are hashed. APNs push tokens are encrypted. Pass authentication uses the `ApplePass` authorization scheme.

Reward mutations increment `last_updated_tag` and upsert one pending update job per pass. A one-minute worker coalesces bursts, sends an empty APNs pass-update payload, removes invalid registrations, and retries transient failures with backoff. Wallet then fetches a newly signed pass with the same pass type and serial number.

## Certificate rotation and health

Owner diagnostics report only configured/missing state, certificate expiry date/days, issued pass count, registrations, and failed update jobs. Rotate the certificate before the 90-day warning threshold, retain the same Pass Type Identifier, deploy the new certificate, generate a test pass, and confirm an installed pass updates.

## Manual iPhone validation

Create two tenant programs and customers, issue points and a punch, open the customer Rewards page on an iPhone, tap Add to Apple Wallet, verify tenant branding/points/punch/QR, then earn, redeem, and expire activity. Confirm the installed pass updates without being re-added and confirm the second tenant cannot read or issue the first tenant's pass.

Code completion does not prove live Wallet readiness. Final production status remains `CODE COMPLETE - APPLE DEVELOPER CONFIGURATION REQUIRED` until a real signed pass installs and updates on an iPhone.

## Troubleshooting

- No add sheet: verify all certificate variables and confirm the response type is `application/vnd.apple.pkpass`.
- Invalid signature: confirm the Pass Type ID certificate matches `APPLE_WALLET_PASS_TYPE_ID`, the team ID is correct, and the WWDR certificate is current.
- Pass does not update: inspect registration count and failed update jobs, then verify APNs access and the public update URL.
- Unauthorized update: confirm the pass uses the same stable serial/authentication token and that no proxy strips the `Authorization` header.
