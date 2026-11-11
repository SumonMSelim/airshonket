FROM python:3.13-slim
WORKDIR /app/pipeline/tests
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["pytest", "-v", "-p", "no:cacheprovider"]
