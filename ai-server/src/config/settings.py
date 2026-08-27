from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    ai_provider: str = ''
    anthropic_api_key: str = ''
    anthropic_model: str = 'claude-sonnet-4-6'
    deepseek_api_key: str = ''
    deepseek_model: str = 'deepseek-chat'
    deepseek_base_url: str = 'https://api.deepseek.com'
    dashscope_api_key: str = ''
    qwen_model: str = 'qwen-plus'
    dashscope_base_url: str = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
    cors_origins: str = 'http://localhost:5173'
    port: int = 3005
    repo_root: str = ''
    # Public path prefix the frontend reaches this service through (nginx maps
    # /altair/ai/ -> :3005/ai/). Used to build clickable live-stream watch URLs.
    public_ai_prefix: str = '/altair/ai'

    # Playwright runner env vars — forwarded to the subprocess so tests hit the
    # correct environment. Empty string means "use Playwright's own default".
    gantt_base_url: str = ''
    gantt_api_url: str = ''
    pbs_portal_base_url: str = ''
    pbs_api_url: str = ''
    pbs_app_base_url: str = ''
    gantt_test_user: str = ''
    gantt_test_pass: str = ''
    pbs_test_user: str = ''
    pbs_test_pass: str = ''

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(',') if o.strip()]


settings = Settings()
