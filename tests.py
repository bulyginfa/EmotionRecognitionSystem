from locust import HttpUser, task, between
import base64

class EmotionTestUser(HttpUser):
    wait_time = between(1, 2)

    @task
    def upload_image(self):
        with open("test_image.jpeg", "rb") as img:
            image_data = img.read()
        files = {'file': ('test_image.jpeg', image_data, 'image/jpeg')}
        self.client.post("/analyze-photo/", files=files)