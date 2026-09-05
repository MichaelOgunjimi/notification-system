"""resolve_template — project-scoped lookup used by the delivery worker."""

import pytest
from pydantic import PostgresDsn
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

import app.model_registry  # noqa: F401
from app.core.config import settings
from app.modules.notifications.enums import NotificationChannel
from app.modules.templates.model import Template
from app.modules.templates.service import resolve_template
from tests.helpers import create_sync_project_api_key

SYNC_TEST_DB_URL = str(
    PostgresDsn.build(
        scheme="postgresql+psycopg2",
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        path=f"{settings.POSTGRES_DB}_test",
    )
)

sync_test_engine = create_engine(SYNC_TEST_DB_URL, poolclass=NullPool)
SyncTestSession = sessionmaker(bind=sync_test_engine, class_=Session, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _clean_sync_tables():
    yield
    with sync_test_engine.connect() as conn:
        conn.execute(text("TRUNCATE templates, api_keys CASCADE"))
        conn.commit()


@pytest.fixture
def session():
    session = SyncTestSession()
    try:
        yield session
    finally:
        session.close()


def test_resolves_a_template_owned_by_the_keys_project(session: Session) -> None:
    api_key = create_sync_project_api_key(session, name="key-a")
    session.add(
        Template(
            project_id=api_key.project_id,
            name="welcome",
            channel=NotificationChannel.EMAIL,
            body="Hi {{ name }}",
            variables=["name"],
        )
    )
    session.commit()

    found = resolve_template(session, "welcome", api_key.id)

    assert found is not None
    assert found.project_id == api_key.project_id


def test_falls_back_to_a_system_default_when_the_project_has_none(session: Session) -> None:
    api_key = create_sync_project_api_key(session, name="key-a")
    session.add(
        Template(
            project_id=None,
            name="welcome",
            channel=NotificationChannel.EMAIL,
            body="Default hi {{ name }}",
            variables=["name"],
        )
    )
    session.commit()

    found = resolve_template(session, "welcome", api_key.id)

    assert found is not None
    assert found.project_id is None


def test_prefers_project_owned_over_a_same_named_system_default(session: Session) -> None:
    """Two rows can legitimately match the same name — a project's own
    template and a system default. Before the project-scope migration, the
    equivalent per-key OR-null query used scalar_one_or_none(), which raises
    MultipleResultsFound the moment two rows tie; merging every key in a
    project into one shared pool makes that collision the common case rather
    than a rare one, so the lookup must tolerate it and pick deterministically.
    """
    api_key = create_sync_project_api_key(session, name="key-a")
    session.add(
        Template(
            project_id=None,
            name="welcome",
            channel=NotificationChannel.EMAIL,
            body="Default hi {{ name }}",
            variables=["name"],
        )
    )
    session.add(
        Template(
            project_id=api_key.project_id,
            name="welcome",
            channel=NotificationChannel.EMAIL,
            body="Project hi {{ name }}",
            variables=["name"],
        )
    )
    session.commit()

    found = resolve_template(session, "welcome", api_key.id)

    assert found is not None
    assert found.project_id == api_key.project_id
    assert found.body == "Project hi {{ name }}"


def test_resolves_by_template_id(session: Session) -> None:
    api_key = create_sync_project_api_key(session, name="key-a")
    template = Template(
        project_id=api_key.project_id,
        name="receipt",
        channel=NotificationChannel.SMS,
        body="Thanks {{ name }}",
        variables=["name"],
    )
    session.add(template)
    session.commit()

    found = resolve_template(session, str(template.id), api_key.id)

    assert found is not None
    assert found.id == template.id


def test_never_resolves_another_projects_template(session: Session) -> None:
    api_key_a = create_sync_project_api_key(session, name="key-a")
    api_key_b = create_sync_project_api_key(session, name="key-b")
    session.add(
        Template(
            project_id=api_key_b.project_id,
            name="welcome",
            channel=NotificationChannel.EMAIL,
            body="B's template",
            variables=[],
        )
    )
    session.commit()

    found = resolve_template(session, "welcome", api_key_a.id)

    assert found is None
