import json
import unittest
from unittest.mock import patch

from beaco import Beaco


class Response:
    def __init__(self, payload=None, status=200):
        self.payload = payload or {"id": "evt_123", "status": "accepted"}
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self):
        return json.dumps(self.payload).encode()


class BeacoTest(unittest.TestCase):
    def test_publish_sends_authenticated_snake_case_request(self):
        with patch("beaco._http.urlopen", return_value=Response()) as mocked:
            client = Beaco(" secret ", base_url="http://localhost:8000/api/v1")
            event = client.events.publish(
                "user.welcome",
                [{"channels": ["email"], "email": "user@example.com"}],
                inline={"subject": "Welcome", "html": "<p>Welcome</p>"},
                idempotency_key="welcome-user-1",
            )

        request = mocked.call_args.args[0]
        self.assertEqual(event["id"], "evt_123")
        self.assertEqual(request.get_header("X-api-key"), "secret")
        self.assertEqual(
            json.loads(request.data),
            {
                "event_type": "user.welcome",
                "recipients": [{"channels": ["email"], "email": "user@example.com"}],
                "inline": {"subject": "Welcome", "html": "<p>Welcome</p>"},
                "idempotency_key": "welcome-user-1",
            },
        )

    def test_inline_email_carries_sender_fields(self):
        inline = {
            "subject": "Order confirmed",
            "html": "<p>Thanks</p>",
            "from_local": "orders",
            "from_name": "Winwell Orders",
            "reply_to": "support@winwell.example",
        }
        with patch("beaco._http.urlopen", return_value=Response()) as mocked:
            Beaco("secret", base_url="http://localhost:8000/api/v1").events.publish(
                "order.confirmed",
                [{"channels": ["email"], "email": "user@example.com"}],
                inline=inline,
            )

        self.assertEqual(json.loads(mocked.call_args.args[0].data)["inline"], inline)

    def test_attachments_are_sent_and_validated_locally(self):
        file = {
            "filename": "invoice.pdf",
            "url": "https://files.example.com/a.pdf",
            "size_bytes": 1000,
        }
        recipients = [{"channels": ["email"], "email": "user@example.com"}]
        inline = {"html": "<p>Thanks</p>"}
        with patch("beaco._http.urlopen", return_value=Response()) as mocked:
            client = Beaco("secret", base_url="http://localhost:8000/api/v1")
            client.events.publish(
                "order.confirmed", recipients, inline=inline, attachments=[file]
            )
            self.assertEqual(
                json.loads(mocked.call_args.args[0].data)["attachments"], [file]
            )

            mocked.reset_mock()
            bad = [
                [{**file, "url": "ftp://files.example.com/a.pdf"}],
                [{**file, "filename": "../a.pdf"}],
                [{**file, "size_bytes": 0}],
                [{**file, "size_bytes": 20_000_000}] * 2,
                [file] * 11,
            ]
            for attachments in bad:
                with self.assertRaises(ValueError):
                    client.events.publish(
                        "order.confirmed",
                        recipients,
                        inline=inline,
                        attachments=attachments,
                    )
            mocked.assert_not_called()

    def test_template_sender_fields_are_sent_and_clearable(self):
        client = Beaco("secret", base_url="http://localhost:8000/api/v1")
        with patch("beaco._http.urlopen", return_value=Response()) as mocked:
            client.templates.create(
                "order-confirmed",
                "email",
                "<p>Hi</p>",
                from_local="billing",
                from_name="Acme Billing",
                reply_to="help@acme.example",
            )
            created = json.loads(mocked.call_args.args[0].data)
            client.templates.update("tpl_1", from_local=None, reply_to=None)
            updated = json.loads(mocked.call_args.args[0].data)

        self.assertEqual(created["from_local"], "billing")
        self.assertEqual(created["from_name"], "Acme Billing")
        self.assertEqual(created["reply_to"], "help@acme.example")
        self.assertEqual(updated, {"from_local": None, "reply_to": None})

    def test_rejects_insecure_remote_base_url(self):
        with self.assertRaisesRegex(ValueError, "must use HTTPS"):
            Beaco("secret", base_url="http://api.example.com/v1")

    def test_all_resource_groups_use_expected_routes(self):
        responses = [
            Response({"id": "tpl_1"}),
            Response({"id": "tpl_1"}),
            Response({"template": {"id": "tpl_2"}, "preview": {"html": "Hi Ada"}}),
            Response({"subject": "Hi Ada", "body": "Welcome"}),
            Response({"id": "ntf_1"}),
            Response({"id": "sch_1"}),
            Response({"id": "sup_1"}),
            Response(status=204),
        ]
        with patch("beaco._http.urlopen", side_effect=responses) as mocked:
            client = Beaco("secret", base_url="http://localhost:8000/api/v1")
            client.templates.create("welcome", "email", "Hi {{ name }}")
            client.templates.upsert_by_name("welcome email", "Hi {{ name }}")
            client.templates.import_html("imported", "<p>Hi Ada</p>", {"name": "Ada"})
            client.templates.preview("tpl_1", {"name": "Ada"})
            client.notifications.retrieve("ntf_1")
            client.scheduled_events.create(
                "user.welcome",
                [{"channels": ["email"], "email": "ada@example.com"}],
                "2026-10-02T09:00:00Z",
            )
            client.suppressions.create("email", "ada@example.com")
            client.suppressions.delete("sup_1")

        requests = [call.args[0] for call in mocked.call_args_list]
        self.assertEqual(
            [(request.method, request.full_url) for request in requests],
            [
                ("POST", "http://localhost:8000/api/v1/templates"),
                (
                    "PUT",
                    "http://localhost:8000/api/v1/templates/by-name/welcome%20email?channel=email",
                ),
                ("POST", "http://localhost:8000/api/v1/templates/import"),
                ("POST", "http://localhost:8000/api/v1/templates/tpl_1/preview"),
                ("GET", "http://localhost:8000/api/v1/notifications/ntf_1"),
                ("POST", "http://localhost:8000/api/v1/scheduled-events"),
                ("POST", "http://localhost:8000/api/v1/suppressions"),
                ("DELETE", "http://localhost:8000/api/v1/suppressions/sup_1"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
