# Crew App ASC deployment

Use the user-selected MIT-licensed rorkai App Store Connect CLI as development tooling, not an app runtime dependency. Brainstorming is unavailable in the session catalog; this scoped design records the implementation decisions.

Add a versioned `.asc/workflow.json` in Crew App: read-only target/build-number preflight → archive outside the checkout → export an IPA → upload checkpoint → processing wait → external group distribution/beta review → read-back evidence. Keep the existing external group/public URL, tester membership and older builds. Never recreate the group to update its build. Never equate processing or submission with approval/availability.

The app's integer `APP_VERSION` and native build number must agree. Query ASC for the next safe build before archiving; fail clearly if the local number must be increased. Preserve marketing version unless ASC evidence requires a new train. No automatic source rewrite during deployment.

Credentials stay in Keychain or environment, private keys outside the repository. Disable ASC telemetry. Ignore local ASC auth/run/signing files, retain only reviewed workflow configuration. Do not retry uncertain uploads automatically; inspect/resume the recorded build ID. No App Store production release, certificate revocation, tester deletion or notification blast is included.

Install relevant upstream skills at a pinned revision using the skill installer. Add a concise repository skill and Crew App agent routing so future sessions discover the workflow. Validate preflight guards with Jest, actual CLI workflow validation/dry-run, and authenticated read-back when credentials become available. Native app UI is unchanged except its release identifier; release/device smoke and public-link verification remain required before claiming delivery.
