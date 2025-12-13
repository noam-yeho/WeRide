FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for GeoAlchemy/PostGIS
RUN apt-get update && apt-get install -y \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN pip install poetry
RUN poetry config virtualenvs.create false

# Copy dependencies first (Caching layer)
COPY pyproject.toml poetry.lock* /app/
RUN poetry install --no-interaction --no-ansi --no-root

# Copy code
COPY . /app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]