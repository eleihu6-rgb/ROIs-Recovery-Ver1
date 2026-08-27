from datetime import timedelta

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    f8_auth_url: str
    f8_base_url: str
    f8_client_id: str = "ROIS"
    f8_sign: str

    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str
    mysql_password: str
    mysql_database: str

    sync_days_ahead: int = 10
    sync_chunk_days: int = 10

    log_level: str = "INFO"

    # All rows written by this migration service (MySQL `modified_by` / `created_by`)
    migration_modified_by: str = Field(default="rois-ai", max_length=64)

    # Legacy MySQL `crew` / child tables (schema differs from early migration doc)
    legacy_crew_filiale: str = Field(default="F8", max_length=6)
    legacy_crew_division: str = Field(default=" ", min_length=1, max_length=1)
    # crew_rank defaults (737) when not from other sources
    legacy_crew_rank_default_ac_type: str = Field(default="737", max_length=20)
    legacy_crew_rank_default_fleet_grp: str = Field(default="737", max_length=20)
    # crew.branch_code from crew.division: P=deck, C=cabin (F8 legacy codes)
    legacy_crew_branch_code_deck: str = Field(default="F801", max_length=30)
    legacy_crew_branch_code_cabin: str = Field(default="F802", max_length=30)

    model_config = {"env_file": ".env"}


settings = Settings()
# YVR timezone offset (UTC-7) for pairing flt_dt conversion
# Added dynamically to avoid pydantic validation issues
settings._yvr_offset = timedelta(hours=7)  # type: ignore[attr-defined]