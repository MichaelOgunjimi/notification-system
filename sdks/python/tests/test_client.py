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
                "idempotency_key": "welcome-user-1",
            },
        )

    def test_rejects_insecure_remote_base_url(self):
        with self.assertRaisesRegex(ValueError, "must use HTTPS"):
            Beaco("secret", base_url="http://api.example.com/v1")

    def test_all_resource_groups_use_expected_routes(self):
        responses = [
            Response({"id": "tpl_1"}),
            Response({"subject": "Hi Ada", "body": "Welcome"}),
            Response({"id": "ntf_1"}),
            Response({"id": "sch_1"}),
            Response({"id": "sup_1"}),
            Response(status=204),
        ]
        with patch("beaco._http.urlopen", side_effect=responses) as mocked:
            client = Beaco("secret", base_url="http://localhost:8000/api/v1")
            client.templates.create("welcome", "email", "Hi {{ name }}")
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
                ("POST", "http://localhost:8000/api/v1/templates/tpl_1/preview"),
                ("GET", "http://localhost:8000/api/v1/notifications/ntf_1"),
                ("POST", "http://localhost:8000/api/v1/scheduled-events"),
                ("POST", "http://localhost:8000/api/v1/suppressions"),
                ("DELETE", "http://localhost:8000/api/v1/suppressions/sup_1"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
