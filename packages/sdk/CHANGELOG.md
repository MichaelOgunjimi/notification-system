# @beaco/sdk

## 1.1.2

### Patch Changes

- Document that attachment URLs are downloaded at send time and must be publicly reachable; private and internal addresses are refused.

## 1.1.1

### Patch Changes

- Link the README to the SDK guide, API reference and source on the docs site.

## 1.1.0

### Minor Changes

- Add optional `attachments` (`{ filename, url, sizeBytes }`) to `events.publish`. Beaco does not store the files: the email provider downloads each `url` when the email is sent, so the URL must stay reachable until delivery succeeds. Up to 10 attachments, 30 MB declared in total; requires the Resend email provider.

## 1.0.4

### Patch Changes

- fa149d4: Add optional `fromLocal`, `fromName`, and `replyTo` to inline emails and templates, so an application can choose the sender name and Reply-To of an email. The sending domain always stays the server's verified domain.

## 1.0.3

### Patch Changes

- Fix TypeScript resolution for CommonJS consumers (`module: Node16`/`NodeNext`): the `require` export now points at `index.d.cts` instead of the ESM typings.

## 1.0.1

### Patch Changes

- Add an explicit MIT license (package.json `license` field and LICENSE file, previously unset).

## 1.0.0

### Major Changes

- 9b338c8: Add initial @beaco/sdk package: a TypeScript/JavaScript SDK for sending notifications from Node.js backends.
