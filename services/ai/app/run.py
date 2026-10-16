import os
from pathlib import Path
from dotenv import load_dotenv
import uvicorn
from .settings import Settings

if __name__ == '__main__':
    load_dotenv(Path.cwd() / '.env', override=False)
    settings = Settings.load()
    uvicorn.run('app.main:create_app', factory=True, host=os.getenv('AI_HOST', '127.0.0.1'),
                port=int(os.getenv('AI_PORT', '8000')), workers=1, access_log=False,
                timeout_graceful_shutdown=settings.timeout + 5)
