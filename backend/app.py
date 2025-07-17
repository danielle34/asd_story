from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import base64

app = FastAPI()

# Allow frontend to connect (adjust origins if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    contents = await file.read()

    # Convert file contents to OpenCV image
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image"})

    # Detect faces using OpenCV Haar Cascade
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 5)

    cropped_faces = []

    for (x, y, w, h) in faces:
        face = img[y:y + h, x:x + w]
        _, buffer = cv2.imencode(".jpg", face)
        face_b64 = base64.b64encode(buffer).decode("utf-8")
        cropped_faces.append(face_b64)

    return JSONResponse(content={
        "filename": file.filename,
        "num_faces": len(faces),
        "faces": cropped_faces  
    })


# # main.py
# from fastapi import FastAPI
# from dreamo_fastapi import router as dreamo_router
# from fastapi.middleware.cors import CORSMiddleware

# app = FastAPI()
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:3000"],  # your React app
#     allow_methods=["POST","GET"],
#     allow_headers=["*"],
# )
# app.include_router(dreamo_router, prefix="/api")
