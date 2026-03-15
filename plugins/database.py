from pymongo import MongoClient

class Users:
    def __init__(self, user):
        self.user = user
    
    def check_username(self,username: str):
        return self.user.find_one({"username": username}) is not None
        
    def add_user(self, username, password, email):
       result = self.user.insert_one({"username":username, "password":password, "email": email})
       return result.inserted_id
    
    def check_email(self,email: str):
        return self.user.find_one({"email": email}) is not None
    
    def get_user(self, email: str):
        return self.user.find_one({"email": email})
    
    def get_user_by_username(self, username: str):
        return self.user.find_one({"username": username})
    
    def get_name(self, username: str):
        return self.user.find_one({"username": username}).get("name", "")
    
    def get_bio(self, username: str):
        return self.user.find_one({"username": username}).get("bio", "")
    
    def update_name(self, username: str, name: str):
        self.user.update_one({"username": username}, {"$set": {"name": name}})
    
    def update_bio(self, username: str, bio: str):
        self.user.update_one({"username": username}, {"$set": {"bio": bio}})

    def update_password(self, username: str, hashed_password: str):
        self.user.update_one({"username": username}, {"$set": {"password": hashed_password}})
    
    def set_exam_notification(self, username: str, status: bool):
        self.user.update_one({"username": username}, {"$set": {"notification_settings.exam_reminders": status}})
    
    def set_clan_notifications(self, username: str, allow_clan_invites: bool):
        self.user.update_one({"username": username}, {"$set": {"notification_settings.clan_invites": allow_clan_invites}})

    def set_todo_time_notifications(self, username: str, allow_todo_time: bool, to_do_time):
        self.user.update_one({"username": username}, {"$set": {"notification_settings.allow_todo_time": allow_todo_time, "notification_settings.to_do_time": str(to_do_time)}})

    def get_notification_settings(self, username: str):
        user = self.user.find_one({"username": username})
        return user.get("notification_settings", {})
    
    def get_wake_me_up_data(self, username: str):
        user = self.user.find_one({"username": username})
        data = user.get("wake_me_up_data", {})
        return {"wake_me_up_enabled": data.get("wake_me_up_enabled", False)}

    def get_wake_me_up_settings(self, username: str):
        user = self.user.find_one({"username": username})
        data = user.get("wake_me_up_data", {})
        return {"wake_me_up_settings": data.get("wake_me_up_settings", {})}

    def set_wake_me_up_data(self, username: str, wake_me_up_enabled: bool, wake_me_up_settings: dict):
        self.user.update_one({"username": username}, {"$set": {"wake_me_up_data": {"wake_me_up_enabled": wake_me_up_enabled, "wake_me_up_settings": wake_me_up_settings}}})

    def update_avatar(self, username: str, avatar_data: str):
        self.user.update_one({"username": username}, {"$set": {"avatar": avatar_data}})
    
    def get_avatar(self, username: str):
        user = self.user.find_one({"username": username})
        return user.get("avatar", "")

    def delete_user(self, username: str):
        self.user.delete_one({"username": username})

    def save_test_result(self, username: str, test_result: dict):
        # append a test to feed
        self.user.update_one(
            {"username": username},
            {"$push": {"test_history": test_result}}
        )

    def get_test_history(self, username: str):
        #Get all test results for a user
        user = self.user.find_one({"username": username})
        return user.get("test_history", []) if user else []

    def delete_test_result(self, username: str, index: int):
        
        history = self.get_test_history(username)
        if index < 0 or index >= len(history):
            return False
        self.user.update_one(
            {"username": username},
            {"$unset": {f"test_history.{index}": 1}}
        )
        self.user.update_one(
            {"username": username},
            {"$pull": {"test_history": None}}
        )
        return True

    # calendar starts here

    def get_calendar_data(self, username: str, month: str):
        
        user = self.user.find_one({"username": username})
        cal = user.get("calendar", {}) if user else {}
        return cal.get(month, {})

    def save_calendar_day(self, username: str, date_key: str, day_data: dict):
        #date_key = YYYY-MM-DD
        month_key = date_key[:7]
        self.user.update_one(
            {"username": username},
            {"$set": {f"calendar.{month_key}.{date_key}": day_data}},
            upsert=True
        )

    def get_calendar_day(self, username: str, date_key: str):
        
        month_key = date_key[:7]
        user = self.user.find_one({"username": username})
        cal = user.get("calendar", {}) if user else {}
        month_data = cal.get(month_key, {})
        return month_data.get(date_key, {})

# schedule starts here

    def save_user_schedule(self, username: str, schedule: dict):
        #schedule = {0: [...], 1: [...], ...}
        self.user.update_one(
            {"username": username},
            {"$set": {"class_schedule": schedule}},
            upsert=True
        )

    def get_user_schedule(self, username: str):
        #Get weekly class schedule
        user = self.user.find_one({"username": username})
        return user.get("class_schedule", {}) if user else {}

    def save_user_group(self, username: str, group: str):
        self.user.update_one(
            {"username": username},
            {"$set": {"selected_group": group}},
            upsert=True
        )

# user group starts here

    def get_user_group(self, username: str):
        """Get user's selected group/section."""
        user = self.user.find_one({"username": username})
        return user.get("selected_group", "") if user else ""


class CollegeEvents:
    def __init__(self, collection):
        self.col = collection

    def set_events(self, events: dict):
        #Replace all events. events = {'YYYY-MM-DD': [{'type': 'holiday'|'event', 'label': '...'}], ...}
        self.col.update_one(
            {"_id": "college_events"},
            {"$set": {"events": events}},
            upsert=True
        )

    def get_events(self):
        # college events
        doc = self.col.find_one({"_id": "college_events"})
        return doc.get("events", {}) if doc else {}


    ## ADMIN FEATURE
    def add_events(self, new_events: dict):
       
        existing = self.get_events()
        for date_key, evts in new_events.items():
            if date_key in existing:
                existing[date_key].extend(evts)
            else:
                existing[date_key] = evts
        self.set_events(existing)