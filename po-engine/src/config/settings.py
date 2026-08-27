from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    live_server_url: str = "http://localhost:3000"
    rule_engine_url: str = "http://localhost:3000"
    database_url: str = ""
    default_time_limit: int = 300  # seconds
    log_level: str = "info"

    # Optimization defaults
    max_duties_per_pairing: int = 5
    max_flights_per_duty: int = 6
    default_brief_minutes: int = 60
    default_debrief_minutes: int = 30
    default_mct_minutes: int = 45  # minimum connection time

    model_config = SettingsConfigDict(env_file=".env", env_prefix="PO_")


settings = Settings()
