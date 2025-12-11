from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from sqlmodel import SQLModel
from app.database import engine, create_db_and_tables
from app.api.auth_routes import router as auth_router
from app.api.chatbot_routes import router as chatbot_router
from app.api.document_routes import router as document_router
from app.api.routes.chat import router as chat_router
from app.api.routes.website_links import router as website_links_router
from app.api.routes.handoff import router as handoff_router
from app.api.routes.analytics import router as analytics_router
from app.api.plan_routes import router as plan_router
from app.api.routes.tickets import router as tickets_router
from app.api.routes.tasks import router as tasks_router
from app.api.routes.workspaces import router as workspaces_router
from app.api.routes.admin import router as admin_router
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Note: Database tables are now managed by Alembic migrations
# Run: alembic upgrade head
# create_db_and_tables()  # Disabled - use migrations instead

app = FastAPI(
    title="AI Chatbot Builder API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS configuration - restrict in production
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)


# Global exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with detailed messages"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": " -> ".join(str(x) for x in error["loc"]),
            "message": error["msg"],
            "type": error["type"]
        })
    
    # Get origin from request
    origin = request.headers.get("origin")
    cors_headers = {}
    if origin and origin in ALLOWED_ORIGINS:
        cors_headers = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true",
        }
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": errors},
        headers=cors_headers
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    
    # Get origin from request
    origin = request.headers.get("origin")
    cors_headers = {}
    if origin and origin in ALLOWED_ORIGINS:
        cors_headers = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true",
        }
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
        headers=cors_headers
    )


# Include routes
app.include_router(auth_router, prefix="/api")
app.include_router(chatbot_router, prefix="/api")
app.include_router(document_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(website_links_router, prefix="/api/chatbots", tags=["Website Links"])
app.include_router(handoff_router, prefix="/api")
app.include_router(plan_router)
app.include_router(tickets_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(workspaces_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/", tags=["Health"])
def root():
    return {
        "message": "AI Chatbot Builder API",
        "version": "1.0.0",
        "status": "operational"
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}


# Serve widget script
@app.get("/widget.js", tags=["Widget"])
async def get_widget_script():
    """Serve the embeddable widget JavaScript file - allows CORS from any origin for embedding"""
    widget_path = os.path.join(os.path.dirname(__file__), "app", "static", "widget.js")
    if os.path.exists(widget_path):
        # Get environment to determine cache settings
        is_production = os.getenv("ENVIRONMENT", "development") == "production"
        
        # In development: no cache, always fetch fresh
        # In production: cache for 1 hour
        cache_control = "public, max-age=3600" if is_production else "no-cache, no-store, must-revalidate"
        
        return FileResponse(
            widget_path,
            media_type="application/javascript",
            headers={
                "Cache-Control": cache_control,
                "Pragma": "no-cache",  # HTTP 1.0 compatibility
                "Expires": "0",  # Proxies
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )
    return JSONResponse(
        status_code=404,
        content={"detail": "Widget script not found"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Serve chat logo
@app.get("/chat-logo.png", tags=["Widget"])
async def get_chat_logo():
    """Serve the chat logo for the widget"""
    logo_path = os.path.join(os.path.dirname(__file__), "app", "static", "chat-logo.png")
    if os.path.exists(logo_path):
        return FileResponse(
            logo_path,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=86400", # Cache for 24 hours
                "Access-Control-Allow-Origin": "*",
            }
        )
    return JSONResponse(
        status_code=404,
        content={"detail": "Logo not found"},
        headers={
            "Access-Control-Allow-Origin": "*",
        }
    )