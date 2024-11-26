const video = document.getElementById('video');
const processedVideo = document.getElementById('processedVideo');
const screenVideo = document.getElementById('screenVideo');
const startCaptureButton = document.getElementById('startCapture');
const uploadForm = document.getElementById('uploadForm');
const analyzedImage = document.getElementById('analyzedImage');
// Получаем доступ к видео элементу

// Настроим получение видео с веб-камеры
navigator.mediaDevices.getUserMedia({ video: true })
    .then(function(stream) {
        video.srcObject = stream;
    })
    .catch(function(error) {
        console.log("Error accessing webcam: ", error);
    });

// Функция для зеркального отображения видео
function mirrorVideo() {
    video.style.transform = 'scaleX(-1)';
}

// Включаем зеркальное отображение при загрузке страницы
mirrorVideo();

// Initialize WebSocket for live video processing
const ws = new WebSocket("ws://localhost:8000/ws");

// Live video stream
navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
    video.srcObject = stream;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 960;
    canvas.height = 720;

    setInterval(() => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = canvas.toDataURL('image/jpeg');
        ws.send(imgData);
    }, 100);
});

ws.onmessage = (event) => {
    processedVideo.src = event.data;
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

// Screen sharing
startCaptureButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
        });

        screenVideo.srcObject = screenStream;

        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
            alert('Screen sharing stopped.');
        });
    } catch (err) {
        console.error("Error: Unable to capture screen.", err);
    }
});
