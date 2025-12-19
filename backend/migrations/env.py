import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from sqlmodel import SQLModel

# 1. Import your models
from app.models import domain  # noqa

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata

# ========================================================
# FIX: Filter out PostGIS and Tiger Geocoder system tables
# ========================================================
def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table":
        # List of PostGIS system tables we don't want Alembic to touch
        ignored_tables = {
            "spatial_ref_sys", "geometry_columns", "geography_columns", "raster_columns",
            "raster_overviews", "layer", "topology",
            # Tiger Geocoder tables (what you sent)
            "addr", "addrfeat", "bg", "county", "county_lookup", "countysub_lookup",
            "cousub", "direction_lookup", "edges", "faces", "featnames",
            "geocode_settings", "geocode_settings_default", "loader_lookuptables",
            "loader_platform", "loader_variables", "pagc_gaz", "pagc_lex",
            "pagc_rules", "place", "place_lookup", "secondary_unit_lookup",
            "state", "state_lookup", "street_type_lookup", "tabblock", "tabblock20",
            "tract", "zcta5", "zip_lookup", "zip_lookup_all", "zip_lookup_base",
            "zip_state", "zip_state_loc"
        }
        if name in ignored_tables:
            return False
    return True

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection, 
        target_metadata=target_metadata,
        include_object=include_object
    )

    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online() -> None:
    import os
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        config.set_main_option("sqlalchemy.url", db_url)

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())