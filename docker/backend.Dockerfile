FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MPLCONFIGDIR=/tmp/ashare-mpl-cache \
    XDG_CACHE_HOME=/tmp/ashare-xdg-cache

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements_api.txt ./
RUN pip install -r requirements_api.txt

COPY api ./api
COPY ashare ./ashare
COPY data ./data
COPY scripts ./scripts
COPY Ashare.py ./Ashare.py
COPY MyTT.py ./MyTT.py

RUN mkdir -p /app/logs /app/data /tmp/ashare-mpl-cache /tmp/ashare-xdg-cache

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
