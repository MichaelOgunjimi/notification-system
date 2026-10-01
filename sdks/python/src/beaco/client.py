"""Top-level Beaco client."""

from ._http import DEFAULT_BASE_URL, Transport
from .events import Events
from .notifications import Notifications
from .scheduled_events import ScheduledEvents
from .suppressions import Suppressions
from .templates import Templates


class Beaco:
    """Server-side client for the Beaco notification API."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 10,
        allow_insecure_http: bool = False,
    ) -> None:
        """Create a server-side Beaco client.

        Args:
            api_key: Secret project API key sent with every request. Keep this value
                on the server and load it from a secret manager or environment variable.
            base_url: Root URL for the Beaco v1 API. HTTPS is required except for
                loopback development addresses.
            timeout: Maximum duration, in seconds, for each HTTP request.
            allow_insecure_http: Explicitly allow a non-loopback HTTP endpoint. This
                sends the API key in cleartext and should only be used in controlled
                development environments.

        Raises:
            ValueError: If the API key is empty, the timeout is not positive, the base
                URL is invalid, or an insecure remote endpoint is configured without
                explicit opt-in.

        Note:
            Constructing the client performs no network I/O. The resource attributes
            share one authenticated transport and are safe to reuse across requests.
        """
        transport = Transport(api_key, base_url, timeout, allow_insecure_http)
        self.events = Events(transport)
        self.templates = Templates(transport)
        self.notifications = Notifications(transport)
        self.scheduled_events = ScheduledEvents(transport)
        self.suppressions = Suppressions(transport)
