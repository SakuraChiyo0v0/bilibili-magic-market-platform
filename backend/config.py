import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Database
    BMM_MYSQL_HOST: str
    BMM_MYSQL_PORT: int
    BMM_MYSQL_USER: str
    BMM_MYSQL_PASSWORD: str
    BMM_MYSQL_DATABASE: str

    # App
    API_PREFIX: str = "/api"

    @property
    def DATABASE_URL(self):
        return f"mysql+pymysql://{self.BMM_MYSQL_USER}:{self.BMM_MYSQL_PASSWORD}@{self.BMM_MYSQL_HOST}:{self.BMM_MYSQL_PORT}/{self.BMM_MYSQL_DATABASE}"

    model_config = SettingsConfigDict(env_file=["../.env"], extra="ignore")

settings = Settings()
print(f"DEBUG CONFIG: User={settings.BMM_MYSQL_USER}, Host={settings.BMM_MYSQL_HOST}, DB={settings.BMM_MYSQL_DATABASE}")
