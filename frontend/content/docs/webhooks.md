# Webhooks

Beacon can deliver notifications to your systems in real time using outbound HTTP webhooks.

## How Webhook Delivery Works

1. You submit an event to Beacon.
2. A recipient includes `channels: ["webhook"]` and a `webhook_url`.
3. Beacon sends an HTTP `POST` request to that URL.
4. Beacon records delivery status, retries transient failures, and exposes logs via API.

## Configure Webhook Recipients

Include `webhook_url` in the recipient object when using the webhook channel.

```bash
curl -X POST https://beacon.michaelogunjimi.com/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "event_type": "invoice.paid",
    "recipients": [{
      "channels": ["webhook"],
      "webhook_url": "https://example.com/beacon/webhooks"
    }],
    "payload": {
      "invoice_id": "inv_10022",
      "amount": "49.00"
    }
  }'
```

## Webhook Payload Format

Beacon sends a JSON body with event and delivery context.

```json
{
  "event_type": "invoice.paid",
  "payload": {
    "invoice_id": "inv_10022",
    "amount": "49.00"
  },
  "notification_id": "ntf_01j4za3vdy8r98t7b4s2v0x4bz",
  "timestamp": "2026-01-12T11:02:17Z"
}
```

Common headers:

| Header | Description |
| --- | --- |
| `Content-Type: application/json` | JSON payload format |
| `X-Beacon-Signature-256` | HMAC-SHA256 signature for verification |

## Retry Behavior

Beacon retries failed webhook deliveries using exponential backoff with jitter.

| Condition | Behavior |
| --- | --- |
| Timeout / network failure | Retry |
| HTTP `5xx` | Retry |
| HTTP `2xx` | Mark delivered |
| Max retries exceeded | Move to dead-letter state |

See [Delivery Pipeline](/docs/delivery) for retry and dead-letter operations.

## Verify Webhook Signatures (HMAC-SHA256)

Use a shared secret and verify each request signature.

Verification steps:

1. Read raw request body.
2. Compute `HMAC_SHA256(secret, raw_body)`.
3. Compare with `X-Beacon-Signature-256` using constant-time comparison.

### Node.js / Express Example

```js
import crypto from "crypto";
import express from "express";

const app = express();
const webhookSecret = process.env.BEACON_WEBHOOK_SECRET;

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.post("/beacon/webhooks", (req, res) => {
  const signature = req.header("X-Beacon-Signature-256");
  if (!signature || !webhookSecret) {
    return res.status(401).send("Missing signature");
  }

  const digest = crypto
    .createHmac("sha256", webhookSecret)
    .update(req.rawBody)
    .digest("hex");

  const expected = `sha256=${digest}`;
  const valid = crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature),
  );

  if (!valid) {
    return res.status(401).send("Invalid signature");
  }

  // Process asynchronously in your job queue.
  res.status(204).end();
});
```

## Best Practices

1. **Return `2xx` quickly** (under a few seconds).
2. **Process asynchronously** after acknowledging receipt.
3. **Use idempotency** keyed by `notification_id` to avoid duplicate side effects.
4. **Handle timeouts and retries** safely.
5. **Log signature failures** and malformed payloads for security visibility.

## Related Docs

- [Channels](/docs/channels)
- [Events](/docs/events)
- [Delivery Pipeline](/docs/delivery)
- [API Reference](/docs/api-reference)
