FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY frontend ./frontend

RUN useradd --system --create-home --uid 1000 jetlag
USER jetlag

EXPOSE 80

CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "80", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
