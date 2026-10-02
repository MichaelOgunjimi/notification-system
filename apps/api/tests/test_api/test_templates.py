"""Template endpoint tests."""

import pytest
from httpx import AsyncClient

from app.modules.credentials.model import ApiKey


def _template_payload(**overrides):
    base = {
        "name": "test_template",
        "channel": "email",
        "subject": "Hello {{ name }}",
        "body": "<p>Hi {{ name }}, welcome!</p>",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_template(auth_client: AsyncClient, api_key_pair: tuple[ApiKey, str]) -> None:
    resp = await auth_client.post("/api/v1/templates", json=_template_payload())
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test_template"
    assert data["channel"] == "email"
    assert data["is_active"] is True
    assert data["api_key_id"] == str(api_key_pair[0].id)


@pytest.mark.asyncio
async def test_list_templates(auth_client: AsyncClient) -> None:
    await auth_client.post("/api/v1/templates", json=_template_payload(name="list_t1"))
    await auth_client.post("/api/v1/templates", json=_template_payload(name="list_t2"))

    resp = await auth_client.get("/api/v1/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    assert len(data["items"]) >= 2


@pytest.mark.asyncio
async def test_get_template(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post("/api/v1/templates", json=_template_payload(name="get_t"))
    tid = create_resp.json()["id"]

    resp = await auth_client.get(f"/api/v1/templates/{tid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == tid


@pytest.mark.asyncio
async def test_update_template(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post("/api/v1/templates", json=_template_payload(name="upd_t"))
    tid = create_resp.json()["id"]

    resp = await auth_client.put(
        f"/api/v1/templates/{tid}",
        json={"body": "<p>Updated body</p>"},
    )
    assert resp.status_code == 200
    assert resp.json()["body"] == "<p>Updated body</p>"


@pytest.mark.asyncio
async def test_delete_template(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post("/api/v1/templates", json=_template_payload(name="del_t"))
    tid = create_resp.json()["id"]

    resp = await auth_client.delete(f"/api/v1/templates/{tid}")
    assert resp.status_code == 204

    resp = await auth_client.get(f"/api/v1/templates/{tid}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_template(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/v1/templates/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_detects_variables_and_rejects_declared_mismatch(auth_client: AsyncClient) -> None:
    created = await auth_client.post("/api/v1/templates", json=_template_payload(name="detected"))
    assert created.status_code == 201
    assert created.json()["variables"] == ["name"]
    assert created.json()["detected_variables"] == ["name"]

    mismatch = await auth_client.post(
        "/api/v1/templates",
        json=_template_payload(name="mismatch", variables=["other"]),
    )
    assert mismatch.status_code == 422
    assert "detected=['name']" in mismatch.json()["error"]["message"]


@pytest.mark.asyncio
async def test_upsert_by_name_is_idempotent(auth_client: AsyncClient) -> None:
    first = await auth_client.put(
        "/api/v1/templates/by-name/order-confirmed?channel=email",
        json={"subject": "Order {{ number }}", "body": "<p>First {{ number }}</p>"},
    )
    second = await auth_client.put(
        "/api/v1/templates/by-name/order-confirmed?channel=email",
        json={"subject": "Order {{ number }}", "body": "<p>Second {{ number }}</p>"},
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["body"] == "<p>Second {{ number }}</p>"


@pytest.mark.asyncio
async def test_import_returns_template_preview_and_rejects_ambiguity(
    auth_client: AsyncClient,
) -> None:
    imported = await auth_client.post(
        "/api/v1/templates/import",
        json={
            "name": "brand-order",
            "subject": "Order ready",
            "html": "<h1>Hello Chidi</h1>",
            "variables": {"customer_name": "Chidi"},
        },
    )
    assert imported.status_code == 201
    assert imported.json()["template"]["body"] == "<h1>Hello {{ customer_name }}</h1>"
    assert imported.json()["preview"]["html"] == "<h1>Hello Chidi</h1>"
    assert imported.json()["preview"]["text"] == "Hello Chidi"

    ambiguous = await auth_client.post(
        "/api/v1/templates/import",
        json={
            "name": "ambiguous",
            "subject": "Hi",
            "html": '<p title="Chidi">Chidi</p>',
            "variables": {"customer_name": "Chidi"},
        },
    )
    assert ambiguous.status_code == 422
    assert "attribute" in ambiguous.text


@pytest.mark.asyncio
async def test_preview_reports_used_missing_and_plain_text(auth_client: AsyncClient) -> None:
    created = await auth_client.post(
        "/api/v1/templates",
        json=_template_payload(
            name="preview-parts",
            body="<p>Hi {{ name }}, order {{ order }}</p>",
            text_body="Hi {{ name }}, order {{ order }}",
        ),
    )
    response = await auth_client.post(
        f"/api/v1/templates/{created.json()['id']}/preview",
        json={"variables": {"name": "Chidi"}},
    )

    assert response.status_code == 200
    assert response.json()["variables_used"] == ["name"]
    assert response.json()["missing_variables"] == ["order"]
    assert response.json()["text"] == "Hi Chidi, order "


@pytest.mark.asyncio
async def test_template_sender_fields_round_trip_and_clear(auth_client: AsyncClient) -> None:
    created = await auth_client.post(
        "/api/v1/templates",
        json=_template_payload(
            name="sender-fields",
            from_local="billing",
            from_name="Acme Billing",
            reply_to="help@acme.example",
        ),
    )
    assert created.status_code == 201
    data = created.json()
    assert data["from_local"] == "billing"
    assert data["from_name"] == "Acme Billing"
    assert data["reply_to"] == "help@acme.example"

    cleared = await auth_client.put(
        f"/api/v1/templates/{data['id']}", json={"from_local": None, "reply_to": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["from_local"] is None
    assert cleared.json()["reply_to"] is None
    assert cleared.json()["from_name"] == "Acme Billing"


@pytest.mark.asyncio
async def test_template_sender_fields_default_to_none(auth_client: AsyncClient) -> None:
    created = await auth_client.post("/api/v1/templates", json=_template_payload(name="no-sender"))
    data = created.json()
    assert (data["from_local"], data["from_name"], data["reply_to"]) == (None, None, None)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"from_local": "orders@evil.example"},
        {"from_local": "Orders"},
        {"from_name": "Line\nBreak"},
        {"reply_to": "not-an-address"},
        {"reply_to": "a@b.com\nBcc: x@y.z"},
    ],
)
async def test_template_rejects_invalid_sender_fields(
    auth_client: AsyncClient, overrides: dict
) -> None:
    resp = await auth_client.post(
        "/api/v1/templates", json=_template_payload(name="bad-sender", **overrides)
    )
    assert resp.status_code == 422
