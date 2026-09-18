from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.auth import require_api_key
from .api.routes_audit import router as audit_router
from .api.routes_auth import router as auth_router
from .api.routes_dataset import router as dataset_router
from .api.routes_drift import router as drift_router
from .api.routes_federated import router as federated_router
from .api.routes_inference import router as inference_router
from .api.routes_model import router as model_router
from .api.routes_report import router as report_router
from .api.routes_scenarios import router as scenarios_router
from .api.routes_uploads import router as uploads_router

app = FastAPI(
    title="IntelX | Trustworthy Computer Vision Assurance System",
    description="Offline Air-Gapped Multi-Contributor Computer Vision Integrity Assurance Platform for Indian Army (DGIS) / MoD.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # Auth here is the X-API-Key header (see api/auth.py), never cookies --
    # no request this app makes needs allow_credentials, and combined with
    # a wildcard origin it would make Starlette reflect back any request's
    # Origin instead of a literal "*", letting any origin issue credentialed
    # requests. Leaving it False keeps the wildcard meaning what it says.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Every route below requires the X-API-Key header IF (and only if) the
# operator has set IntelX_API_KEY -- see api/auth.py for why this is a
# deliberately lightweight MVP gate, not full RBAC. /health is
# deliberately excluded so liveness checks work even on a locked-down
# deployment.
_auth_dep = [Depends(require_api_key)]
app.include_router(auth_router, dependencies=_auth_dep)
app.include_router(scenarios_router, dependencies=_auth_dep)
app.include_router(dataset_router, dependencies=_auth_dep)
app.include_router(model_router, dependencies=_auth_dep)
app.include_router(inference_router, dependencies=_auth_dep)
app.include_router(drift_router, dependencies=_auth_dep)
app.include_router(federated_router, dependencies=_auth_dep)
app.include_router(audit_router, dependencies=_auth_dep)
app.include_router(report_router, dependencies=_auth_dep)
app.include_router(uploads_router, dependencies=_auth_dep)


@app.get("/health")
async def health_check():
    return {
        "status": "OPERATIONAL",
        "mode": "AIR_GAPPED_OFFLINE",
        "service": "IntelX Assurance Core",
        "ps_id": "26228",
        "authority": "MoD / Indian Army DGIS",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
