# tests/test_client.py
"""Tests for F8 API client and token management."""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta


def _mock_token_response():
    exp = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"accessToken": "test-token-abc", "accessTokenExpirationTime": exp}


def test_token_manager_fetches_token_on_first_call():
    """Test that get_token() calls auth endpoint and caches result."""
    from f8.client import TokenManager
    import httpx

    with patch("f8.client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.json.return_value = _mock_token_response()
        mock_resp.raise_for_status = MagicMock()
        mock_client.post.return_value = mock_resp

        mgr = TokenManager(
            auth_url="https://example.com/auth",
            client_id="ROIS",
            sign="abc123",
        )
        token = mgr.get_token()
        assert token == "test-token-abc"
        assert mock_client.post.call_count == 1


def test_token_manager_reuses_cached_token():
    """Test that get_token() reuses cached token within expiry window."""
    from f8.client import TokenManager

    with patch("f8.client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.json.return_value = _mock_token_response()
        mock_resp.raise_for_status = MagicMock()
        mock_client.post.return_value = mock_resp

        mgr = TokenManager(auth_url="https://x.com", client_id="R", sign="s")
        mgr.get_token()
        mgr.get_token()
        assert mock_client.post.call_count == 1  # fetched only once


def test_token_manager_refreshes_expired_token():
    """Test that get_token() refreshes token when expired."""
    from f8.client import TokenManager

    with patch("f8.client.httpx.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client

        # First call returns a token expiring soon
        first_resp = MagicMock()
        first_exp = (datetime.now(timezone.utc) + timedelta(seconds=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        first_resp.json.return_value = {"accessToken": "first-token", "accessTokenExpirationTime": first_exp}
        first_resp.raise_for_status = MagicMock()

        # Second call returns a new token
        second_resp = MagicMock()
        second_exp = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        second_resp.json.return_value = {"accessToken": "second-token", "accessTokenExpirationTime": second_exp}
        second_resp.raise_for_status = MagicMock()

        mock_client.post.side_effect = [first_resp, second_resp]

        mgr = TokenManager(auth_url="https://x.com", client_id="R", sign="s")
        token1 = mgr.get_token()
        assert token1 == "first-token"

        # Manually expire the token (set expires_at to past)
        mgr._expires_at = 0

        token2 = mgr.get_token()
        assert token2 == "second-token"
        assert mock_client.post.call_count == 2


def test_f8_client_get_crew():
    """Test F8Client.get_crew() makes correct request."""
    from f8.client import F8Client

    with patch("f8.client._request_with_retry") as mock_request:
        mock_request.return_value = [{"crewId": 1, "firstName": "John"}]
        client = F8Client()
        result = client.get_crew()
        assert result == [{"crewId": 1, "firstName": "John"}]
        mock_request.assert_called_once()
        call_args = mock_request.call_args
        assert call_args[0][0] == "post"
        assert "/crew" in call_args[0][1]


def test_f8_client_get_flight():
    """Test F8Client.get_flight() passes date range."""
    from f8.client import F8Client

    with patch("f8.client._request_with_retry") as mock_request:
        mock_request.return_value = [{"legNo": 1}]
        client = F8Client()
        result = client.get_flight("2024-01-01", "2024-01-10")
        assert result == [{"legNo": 1}]
        call_args = mock_request.call_args
        assert call_args[1]["json"] == {"startDt": "2024-01-01", "endDt": "2024-01-10"}


def test_f8_client_get_pairing_unwraps_body():
    """Test F8Client.get_pairing() unwraps 'body' wrapper if present."""
    from f8.client import F8Client

    with patch("f8.client._request_with_retry") as mock_request:
        # API may return {"statusCode": 200, "body": [...]}
        mock_request.return_value = {
            "statusCode": 200,
            "body": [{"pairingId": "P001"}]
        }
        client = F8Client()
        result = client.get_pairing("2024-01-01", "2024-01-10")
        assert result == [{"pairingId": "P001"}]


def test_f8_client_get_pairing_returns_as_is():
    """Test F8Client.get_pairing() returns list directly if no wrapper."""
    from f8.client import F8Client

    with patch("f8.client._request_with_retry") as mock_request:
        mock_request.return_value = [{"pairingId": "P001"}]
        client = F8Client()
        result = client.get_pairing("2024-01-01", "2024-01-10")
        assert result == [{"pairingId": "P001"}]


def test_request_with_retry_adds_auth_header():
    """Test that _request_with_retry adds AuthorizationToken header."""
    from f8.client import _request_with_retry

    with patch("f8.client._token_manager") as mock_tm:
        mock_tm.get_token.return_value = "my-token"
        with patch("f8.client.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"data": "ok"}
            mock_resp.raise_for_status = MagicMock()
            mock_client.get.return_value = mock_resp

            result = _request_with_retry("get", "https://api.example.com/test")
            assert result == {"data": "ok"}
            # Verify header was set
            call_kwargs = mock_client.get.call_args[1]
            assert call_kwargs["headers"]["AuthorizationToken"] == "my-token"


def test_request_with_retry_retries_on_network_error():
    """Test that _request_with_retry retries on network errors (not just HTTPStatusError)."""
    from f8.client import _request_with_retry
    import httpx

    with patch("f8.client._token_manager") as mock_tm:
        mock_tm.get_token.return_value = "my-token"
        with patch("f8.client.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client

            # First two calls fail with ConnectError, third succeeds
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"data": "ok"}
            mock_resp.raise_for_status = MagicMock()

            mock_client.get.side_effect = [
                httpx.ConnectError("Connection refused"),
                httpx.ConnectError("Connection refused"),
                mock_resp,
            ]

            result = _request_with_retry("get", "https://api.example.com/test", retries=3, retry_delay=0.01)
            assert result == {"data": "ok"}
            assert mock_client.get.call_count == 3  # Failed twice, succeeded on third


def test_request_with_retry_raises_after_all_retries_exhausted():
    """Test that _request_with_retry raises the last exception after all retries fail."""
    from f8.client import _request_with_retry
    import httpx

    with patch("f8.client._token_manager") as mock_tm:
        mock_tm.get_token.return_value = "my-token"
        with patch("f8.client.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client

            # All calls fail with TimeoutException
            mock_client.get.side_effect = httpx.TimeoutException("Request timed out")

            with pytest.raises(httpx.TimeoutException, match="Request timed out"):
                _request_with_retry("get", "https://api.example.com/test", retries=2, retry_delay=0.01)

            assert mock_client.get.call_count == 3  # Initial + 2 retries