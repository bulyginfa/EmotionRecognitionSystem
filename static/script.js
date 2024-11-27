const WebCamVideo = document.getElementById('WebcamVideo');
const processedWebCamVideo = document.getElementById('processedWebCamVideo');

const screenVideo = document.getElementById('screenVideo');
const processedScreenVideo = document.getElementById('processedScreenVideo');

const startWebcamButton = document.getElementById('startWebcam');
const startCaptureButton = document.getElementById('startCapture');
const uploadForm = document.getElementById('uploadForm');
const analyzedImage = document.getElementById('analyzedImage');

const ws = new WebSocket("ws://localhost:8000/ws");

// Функция для зеркального отображения видео
function mirrorVideo() {
    WebCamVideo.style.transform = 'scaleX(-1)';
    screenVideo.style.transform = 'scaleX(-1)';
}

mirrorVideo()

// Настройка кнопки для начала видеостриминга с веб-камеры
startWebcamButton.addEventListener('click', async () => {
    try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        WebCamVideo.srcObject = videoStream;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 960;
        canvas.height = 720;

        // Отправка кадров с веб-камеры через WebSocket
        setInterval(() => {
            context.drawImage(WebCamVideo, 0, 0, canvas.width, canvas.height);
            const imgData = canvas.toDataURL('image/jpeg');
            ws.send(JSON.stringify({ type: 'webcam', img: imgData }));
        }, 90);
    } catch (error) {
        console.error("Error accessing webcam:", error);
        alert("Error accessing webcam.");
    }
});

// Настройка кнопки для начала видеостриминга с захвата экрана
startCaptureButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenVideo.srcObject = screenStream;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 960;
        canvas.height = 720;

        // Отправка кадров с экрана через WebSocket
        setInterval(() => {
            context.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
            const imgData = canvas.toDataURL('image/jpeg');
            ws.send(JSON.stringify({ type: 'screen', img: imgData }));
        }, 90);
    } catch (err) {
        console.error("Error: Unable to capture screen.", err);
    }
});

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'webcam') {
        processedWebCamVideo.src = data.image;
    } else if (data.type === 'screen') {
        processedScreenVideo.src = data.image;
    }

    console.log("Probabilities:", data.probabilities);
};

// Upload photo for analysis
uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('fileInput').files[0];

    if (!fileInput) {
        alert("Please select a file!");
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput);

    try {
        const response = await fetch('/analyze-photo/', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const result = await response.json();

            // Отобразить преобразованное изображение
            const imageBase64 = result.image;
            analyzedImage.src = `data:image/jpeg;base64,${imageBase64}`;

            // Вероятности эмоций остаются в консоли (не отображаются)
            console.log("Probabilities:", result.probabilities);
        } else {
            alert("Failed to analyze the photo.");
        }
    } catch (err) {
        console.error("Error analyzing photo:", err);
        alert("An error occurred while processing the image.");
    }
});

