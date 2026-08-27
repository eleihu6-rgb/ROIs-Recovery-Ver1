# tests/conftest.py
"""Pytest configuration and fixtures for data-migration tests."""
import os

# Set required environment variables BEFORE any module imports
# This must be at module level, not in a fixture, to work before test collection
os.environ["F8_AUTH_URL"] = "http://localhost:8080"
os.environ["F8_BASE_URL"] = "http://localhost:8080"
os.environ["F8_CLIENT_ID"] = "ROIS"
os.environ["F8_SIGN"] = "test_sign"
os.environ["MYSQL_HOST"] = "localhost"
os.environ["MYSQL_PORT"] = "3306"
os.environ["MYSQL_USER"] = "test_user"
os.environ["MYSQL_PASSWORD"] = "test_password"
os.environ["MYSQL_DATABASE"] = "test_db"