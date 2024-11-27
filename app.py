"""
python -m uvicorn app:app --reload
"""

import os
from pathlib import Path
from PIL import Image
import io
from io import BytesIO
import base64
from base64 import b64encode
import json
from fastapi import FastAPI, File, UploadFile, WebSocket
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import mediapipe as mp
import cv2
import torch
import torch.nn as nn
from torchvision import transforms
import numpy as np
from utils.hparams import setup_hparams
from utils.setup_network import setup_network



# Настройка приложения
app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Настройка модели
device = "cuda" if torch.cuda.is_available() else "cpu"
emotion_dict = {0: 'Angry', 1: 'Disgust', 2: 'Fear', 3: 'Happy', 4: 'Sad', 5: 'Surprise', 6: 'Neutral'}

data_transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Grayscale(num_output_channels=1),
    transforms.Resize((48, 48)),
    transforms.ToTensor()
])

# Загрузка модели
hps = setup_hparams([
    'network=ensemble',
    'sub1_path=checkpoints/my_sub1/epoch_300',
    'sub2_path=checkpoints/my_sub2/epoch_160',
    'sub3_path=checkpoints/my_sub3/epoch_160',
    'vgg_path=checkpoints/my_vgg/epoch_160'
])
er, net = setup_network(hps)
net = net.to(device)


def process_frame(frame, faceDetection, net, data_transform, emotion_dict, device):
    """
    Обработка кадра: детекция лиц, анализ эмоций и отрисовка результатов.
    """
    face_tensors = []
    probabilities = []
    bboxes = []
    
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = faceDetection.process(frame_rgb)

    if results.detections:
        for detection in results.detections:
            bboxC = detection.location_data.relative_bounding_box
            ih, iw, _ = frame.shape
            x_min = int(bboxC.xmin * iw)
            y_min = int(bboxC.ymin * ih)
            width = int(bboxC.width * iw)
            height = int(bboxC.height * ih)

            # Выделение лица
            face = frame[y_min:y_min + height, x_min:x_min + width]
            if face.size == 0:
                continue
            face_tensor = data_transform(face)
            face_tensors.append(face_tensor.unsqueeze(0))
            bboxes.append((x_min, y_min, width, height))

        if face_tensors:
            face_tensors = torch.cat(face_tensors).to(device)
            outputs = net(face_tensors)
            probs = nn.Softmax(dim=1)(outputs)

            for i, (bbox, prob) in enumerate(zip(bboxes, probs)):
                x_min, y_min, width, height = bbox
                top_prob, top_class = torch.max(prob, 0)
                face_emotion = emotion_dict[top_class.item()]
                face_text = f"{face_emotion}: {top_prob * 100:.2f}%"
                y_text = y_min - 10 if y_min - 10 > 10 else y_min + 10

                probabilities.append({emotion: float(p) for emotion, p in zip(emotion_dict.values(), prob)})
                
                # Отрисовка прямоугольника и текста
                cv2.rectangle(frame, (x_min, y_min), (x_min + width, y_min + height), (80, 160, 30), 3)
                cv2.putText(frame, face_text, (x_min, y_text), cv2.FONT_HERSHEY_TRIPLEX, 0.8, (80, 160, 30), 1, cv2.LINE_AA)

                # Отображение вероятностей для каждой эмоции
                for j, (emotion, p) in enumerate(zip(emotion_dict.values(), prob)):
                    prob_text = f"{emotion}: {p * 100:.2f}%"
                    bar_width = int(p * 95)
                    cv2.rectangle(frame, (x_min + width, y_min + j * 10), (x_min + width + bar_width, y_min + j * 10 - 7), (0, 0, 165), -1)
                    cv2.putText(frame, prob_text, (x_min + width, y_min + j * 10), cv2.FONT_HERSHEY_TRIPLEX, 0.35, (255, 255, 255), 1, cv2.LINE_AA)

    return frame, probabilities



@app.get("/", response_class=HTMLResponse)
async def get_homepage():
    with open("templates/index.html", "r", encoding="utf-8") as file:
        return HTMLResponse(content=file.read())


@app.post("/analyze-photo/")
async def analyze_photo(file: UploadFile = File(...)):
    """
    Анализ эмоций на загруженном изображении.
    """
    contents = await file.read()
    np_img = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(np_img, cv2.IMREAD_COLOR)

    # Обработка изображения
    mpFaceDetection = mp.solutions.face_detection
    faceDetection = mpFaceDetection.FaceDetection(0.7)

    processed_frame, probabilities = process_frame(frame, faceDetection, net, data_transform, emotion_dict, device)

    # Конвертация результата в изображение
    _, encoded_image = cv2.imencode(".jpg", processed_frame)
    image_base64 = b64encode(encoded_image).decode('utf-8')

    # Формирование ответа
    response_data = {
        "image": image_base64,  # Кодированное изображение в формате base64
        "probabilities": probabilities,  # Вероятности эмоций
    }
    return JSONResponse(content=response_data)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Обработка видео с камеры через WebSocket.
    """
    await websocket.accept()
    mpFaceDetection = mp.solutions.face_detection
    faceDetection = mpFaceDetection.FaceDetection(0.7)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
    
            print(message)
            img_bytes = data.split(",")[2]
            img_array = np.frombuffer(base64.b64decode(img_bytes), dtype=np.uint8)
            frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            frame = cv2.flip(frame, 1)

            processed_frame, probabilities = process_frame(frame, faceDetection, net, data_transform, emotion_dict, device)

            _, encoded_image = cv2.imencode(".jpg", processed_frame)
            jpg_as_text = base64.b64encode(encoded_image).decode("utf-8")
            img_data_url = f"data:image/jpeg;base64,{jpg_as_text}"

            response = {
                    "image": img_data_url,
                    "probabilities": probabilities,
                    "type": message['type']
                }
            
            await websocket.send_text(json.dumps(response))

    except Exception as e:
        print(f"Exception occurred: {e}")
        await websocket.close()