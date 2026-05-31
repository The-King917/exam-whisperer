import os
import json
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

# Grab the API key from your environment variables
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.serve_file("index.html", "text/html")
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/api/predict":
            self.handle_predict()
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def serve_file(self, filename, content_type):
        try:
            with open(filename, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.end_headers()
            self.wfile.write(data)
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()

    def handle_predict(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            payload = json.loads(body)

            syllabus = payload.get("syllabus", "").strip()
            writing = payload.get("writing", "").strip()

            if not syllabus:
                self.json_error(400, "syllabus is required")
                return

            if not ANTHROPIC_API_KEY:
                self.json_error(500, "API key not configured on server")
                return

            style_note = f'\n\nThe student\'s writing style (match this exactly in the answer): "{writing}"' if writing else ""

            prompt = f"""You are an expert AP exam analyst with 20 years of experience predicting College Board exam questions.

Analyze these class materials and predict the 10 most likely exam questions:

{syllabus}
{style_note}

Respond ONLY with valid JSON in this exact format, no other text:
{{
  "questions": [
    {{"num": 1, "question": "question text here", "confidence": 91, "topic": "topic name"}},
    {{"num": 2, "question": "question text here", "confidence": 78, "topic": "topic name"}}
  ],
  "answer": "A full model answer to question #1, written in the student's exact voice and style. At least 4-5 sentences."
}}"""

            anthropic_payload = json.dumps({
                # FIXED: Changed from 'claude-opus-4-5' to a valid, supported Anthropic model name
                "model": "claude-3-5-sonnet-20240620",
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}]
            }).encode()

            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=anthropic_payload,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01"
                },
                method="POST"
            )

            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())

            text = data["content"][0]["text"]
            clean = text.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(clean)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(parsed).encode())

        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            self.json_error(502, f"Anthropic API error: {err_body}")
        except Exception as e:
            self.json_error(500, str(e))

    def json_error(self, code, message):
        body = json.dumps({"error": message}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = 5000
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"Server running on port {port}")
    server.serve_forever()
