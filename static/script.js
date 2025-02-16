const WebCamVideo = document.getElementById('WebcamVideo');
const processedWebCamVideo = document.getElementById('processedWebCamVideo');

const screenVideo = document.getElementById('screenVideo');
const processedScreenVideo = document.getElementById('processedScreenVideo');

const startWebcamButton = document.getElementById('startWebcam');
const startCaptureButton = document.getElementById('startCapture');
const uploadForm = document.getElementById('uploadForm');
const analyzedImage = document.getElementById('analyzedImage');


// Настройка кнопки для начала видеостриминга с веб-камеры
startWebcamButton.addEventListener('click', async () => {
    const ws = new WebSocket("ws://localhost:8000/ws");

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        processedWebCamVideo.src = data.image;
        console.log("Probabilities:", data.probabilities);
    }

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
    const ws = new WebSocket("ws://localhost:8000/ws");

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        processedScreenVideo.src = data.image;
        console.log("Probabilities:", data.probabilities);
    }

    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenVideo.srcObject = screenStream;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = 1000;
        canvas.height = 720;

        let wsInterval = null;
        let postInterval = null;

        // Функция отправки изображения по WebSocket
        function sendViaWebSocket() {
            context.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
            const imgData = canvas.toDataURL('image/jpeg');
            ws.send(JSON.stringify({ type: 'screen', img: imgData }));
        }

        // Функция отправки изображения через POST-запрос
        async function sendViaPost() {
            context.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
            
            // Получаем Blob вместо base64
            canvas.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('file', blob, 'screenshot.jpg'); // Бинарный файл
        
                try {
                    const response = await fetch('/analyze-photo/', {
                        method: 'POST',
                        body: formData
                    });
        
                    const result = await response.json();
                    console.log("Response:", result);
                } catch (error) {
                    console.error('Error sending image via POST:', error);
                }
            }, 'image/jpeg'); // Формат изображения
        }

        // Запускаем интервалы отправки данных
        wsInterval = setInterval(sendViaWebSocket, 90);
        postInterval = setInterval(sendViaPost, 1000);

        // Очистка интервалов при остановке стриминга
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
            clearInterval(wsInterval);
            clearInterval(postInterval);
        });
    } catch (err) {
        console.error("Error: Unable to capture screen.", err);
    }
});



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

            // Вероятности эмоций остаются в консоли
            console.log("Probabilities:", result.probabilities);

            // Отправляем данные на другой сервер
            try {
                const apiResponse = await fetch('http://localhost:8080/makeAddress', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        image: result.image,
                        probabilities: result.probabilities,
                    }),
                });

                if (apiResponse.ok) {
                    console.log('Data sent successfully to the new API.');
                } else {
                    console.error('Failed to send data to the new API.');
                }
            } catch (apiError) {
                console.error('Error sending data to the new API:', apiError);
            }

        } else {
            alert("Failed to analyze the photo.");
        }
    } catch (err) {
        console.error("Error analyzing photo:", err);
        alert("An error occurred while processing the image.");
    }
});