# @beaco/sdk

## 1.0.3

### Patch Changes

- Fix TypeScript resolution for CommonJS consumers (`module: Node16`/`NodeNext`): the `require` export now points at `index.d.cts` instead of the ESM typings.

## 1.0.1

### Patch Changes

- Add an explicit MIT license (package.json `license` field and LICENSE file, previously unset).

## 1.0.0

### Major Changes

- 9b338c8: Add initial @beaco/sdk package: a TypeScript/JavaScript SDK for sending notifications from Node.js backends.
