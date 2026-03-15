import hashlib, json, time
from bson import ObjectId

class LiveTests:

    def __init__(self, collection):
        self.col = collection

    def create_test(self, test_data: dict) -> str:
        test_data['created_at'] = time.time()
        test_data['status'] = 'scheduled'  # scheduled | active | completed
        # Generate content hash for blockchain verification
        content_str = json.dumps(test_data.get('questions', []), sort_keys=True)
        test_data['content_hash'] = hashlib.sha256(content_str.encode()).hexdigest()
        result = self.col.insert_one(test_data)
        return str(result.inserted_id)

    def get_test(self, test_id: str) -> dict:
        return self.col.find_one({"_id": ObjectId(test_id)})

    def get_all_tests(self) -> list:
        return list(self.col.find().sort("schedule.start_time", -1))

    def get_available_tests(self, current_time: float) -> list:
        return list(self.col.find({
            "schedule.window_end": {"$gte": current_time},
            "status": {"$in": ["scheduled", "active"]}
        }).sort("schedule.start_time", 1))

    def update_status(self, test_id: str, status: str):
        self.col.update_one(
            {"_id": ObjectId(test_id)},
            {"$set": {"status": status}}
        )

    def store_blockchain_hash(self, test_id: str, tx_hash: str):
        self.col.update_one(
            {"_id": ObjectId(test_id)},
            {"$set": {"blockchain_tx": tx_hash}}
        )

    def delete_test(self, test_id: str):
        self.col.delete_one({"_id": ObjectId(test_id)})

class Attempts:

    def __init__(self, collection): ## collection her is a mongodb object
        self.col = collection

    def start_attempt(self, student_id: str, test_id: str) -> str:
        doc = {
            "student_id": student_id,
            "test_id": test_id,
            "start_time": time.time(),
            "answers": {},
            "status": "in_progress",  # in_progress | submitted | cheating
            "score": None,
            "submission_hash": None,
            "blockchain_tx": None,
            "events": []
                }
        result = self.col.insert_one(doc)
        return str(result.inserted_id)

    def get_attempt(self, attempt_id: str) -> dict:
        return self.col.find_one({"_id": ObjectId(attempt_id)})

    def get_student_attempt(self, student_id: str, test_id: str) -> dict:
        return self.col.find_one({
            "student_id": student_id,
            "test_id": test_id
        })

    def submit_answers(self, attempt_id: str, answers: dict, score: float):
        answers_str = json.dumps(answers, sort_keys=True)
        submission_hash = hashlib.sha256(answers_str.encode()).hexdigest()
        self.col.update_one(
            {"_id": ObjectId(attempt_id)},
            {"$set": {
                "answers": answers,
                "status": "submitted",
                "submit_time": time.time(),
                "score": score,
                "submission_hash": submission_hash
            }}
            )
        return submission_hash

    def mark_cheating(self, attempt_id: str, reason: str):
        self.col.update_one(
            {"_id": ObjectId(attempt_id)},
            {"$set": {
                "status": "cheating",
                "score": 0,
                "terminated_at": time.time(),
                "termination_reason": reason
            }}
            )

    def store_blockchain_hash(self, attempt_id: str, tx_hash: str):
        self.col.update_one(
            {"_id": ObjectId(attempt_id)},
            {"$set": {"blockchain_tx": tx_hash}}
            )

    def get_attempts_for_test(self, test_id: str) -> list:
        return list(self.col.find({"test_id": test_id}))

    def get_student_history(self, student_id: str) -> list:
        return list(self.col.find({"student_id": student_id}).sort("start_time", -1))

class EventLogs:

    def __init__(self, collection):
        self.col = collection

    def log_event(self, student_id: str, test_id: str, attempt_id: str, event_type: str, details: str = ""):
        self.col.insert_one({
            "student_id": student_id,
            "test_id": test_id,
            "attempt_id": attempt_id,
            "event_type": event_type,
            "details": details,
            "timestamp": time.time()
                })

    def get_events_for_attempt(self, attempt_id: str) -> list:
        return list(self.col.find({"attempt_id": attempt_id}).sort("timestamp", 1))

    def get_events_for_test(self, test_id: str) -> list:
        return list(self.col.find({"test_id": test_id}).sort("timestamp", 1))
