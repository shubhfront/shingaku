from flask import Flask, after_this_request, render_template, url_for, request, redirect, jsonify, session, send_from_directory, Response
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
from dotenv import load_dotenv
from plugins.database import Users
from plugins.database import CollegeEvents
from plugins.email import send_email, send_delete_email
from plugins.pdf_to_cbt import pdf_to_cbt
from plugins.little import evaluate_answers, send_pdf_to_gemini, extract_images_from_pdf, prompt as extraction_prompt, generate_flashcards_from_pdf, extract_kindle_content, extract_kindle_diagrams
from plugins.live_tests_db import LiveTests, Attempts, EventLogs
from plugins.blockchain import generate_hash, store_hash_on_chain, verify_integrity
import os, asyncio, time, uuid, shutil, json, tempfile, io, hashlib, base64, math, struct
from threading import Thread
from bson import ObjectId
from werkzeug.security import check_password_hash
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# Allow OAuth over HTTP for local development
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

# Store active CBT image sessions: { session_id: images_dir_path }
cbt_image_sessions = {}

otp_handler = []

async def otp_handle():
    while True:
        current_time = time.time()
        for i in otp_handler:
            if current_time - i["timestamp"] > 300:  # 5 minutes
                    otp_handler.remove(i)
        await asyncio.sleep(60)



## SECRETS

if os.path.exists('config.env'):
    load_dotenv('config.env')

class Secrets():
    DATABASE_URL = os.environ.get('DATABASE_URL')
    USERNAME = os.environ.get("USERNAME")
    SECRET_KEY = os.environ.get("SECRET_KEY")
    EMAIL = os.environ.get("EMAIL")
    APP_PASSWORD = os.environ.get("APP_PASSWORD")
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

## CREATING Flask Object with Cross Origin Request Sharing

app = Flask(__name__)
app.secret_key = Secrets.SECRET_KEY ## FOR COOKIE PROTECTION
CORS(app) ## enables to request from any website 

## CREATING DATABASE Objects

cluster = MongoClient(Secrets.DATABASE_URL)
db = cluster[Secrets.USERNAME]
users  = db["users"]
college_events_col = db["college_events"]
cedb = CollegeEvents(college_events_col)

## INTIALIZING LOGIN MANAGER
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"  

class User(UserMixin):
    def __init__(self, user_doc):
        self.id = str(user_doc["_id"])
        self.username = user_doc["username"]
        self.email = user_doc["email"]
        self.password = user_doc["password"]

@login_manager.user_loader
def load_user(user_id):
    us = users.find_one({"_id": ObjectId(user_id)})
    if us:
        return User(us)
    return None




## DATABASE class
udb = Users(users)

def generate_pixel_avatar(seed, size=12):
    """Generate a pixel avatar as a PNG data URI, server-side."""
    import struct, zlib
    scale = 10
    w = h = size * scale
    s = seed + "salt"
    hv = 0
    for ch in s:
        hv = ord(ch) + ((hv << 5) - hv)
        hv &= 0xFFFFFFFF
    def rng():
        nonlocal hv
        x = abs(math.sin(hv) * 10000)
        hv += 1
        return x - int(x)
    bg_colors = [(26,26,26),(30,58,138),(76,29,149),(5,46,22),(127,29,29),(51,51,51)]
    skin_colors = [(253,208,177),(224,172,105),(141,85,36),(198,134,66),(241,194,125)]
    hair_colors = [(15,15,15),(74,44,42),(230,195,92),(141,45,45),(94,58,40),(255,107,0),(0,210,255)]
    shirt_colors = [(239,68,68),(59,130,246),(16,185,129),(245,158,11),(139,92,246)]
    bg = bg_colors[int(rng()*len(bg_colors))]
    skin = skin_colors[int(rng()*len(skin_colors))]
    hair = hair_colors[int(rng()*len(hair_colors))]
    shirt = shirt_colors[int(rng()*len(shirt_colors))]
    pixels = [[bg]*size for _ in range(size)]
    def rect(x,y,rw,rh,c):
        for dy in range(rh):
            for dx in range(rw):
                if 0<=x+dx<size and 0<=y+dy<size:
                    pixels[y+dy][x+dx]=c
    rect(3,3,6,6,skin); rect(4,9,4,2,skin)
    rect(2,10,8,2,shirt)
    ht = int(rng()*3)
    if ht==0:
        rect(3,2,6,2,hair); rect(2,3,1,4,hair); rect(9,3,1,4,hair)
    elif ht==1:
        rect(3,1,6,3,hair); rect(1,3,2,5,hair); rect(9,3,2,5,hair)
    else:
        rect(3,2,6,1,skin)
    eye = (0,210,255) if rng()>0.8 else (0,0,0)
    rect(4,5,1,1,eye); rect(7,5,1,1,eye)
    mouth = (0,0,0) if rng()>0.5 else (170,0,0)
    rect(5,7,2,1,mouth)
    # Build raw RGBA image data (scaled)
    raw = b''
    for row in pixels:
        for _ in range(scale):
            line = b'\x00'
            for c in row:
                for _ in range(scale):
                    line += bytes([c[0],c[1],c[2],255])
            raw += line
    def png_chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    png = sig + png_chunk(b'IHDR', ihdr) + png_chunk(b'IDAT', zlib.compress(raw)) + png_chunk(b'IEND', b'')
    return "data:image/png;base64," + base64.b64encode(png).decode()

## LIVE TESTS database collections
live_tests_col = db["live_tests"]
attempts_col = db["live_test_attempts"]
event_logs_col = db["live_test_events"]
notifications_col = db["notifications"]
ai_cache_col = db["ai_cache"]
ai_cache_col.create_index([("drive_id", 1), ("type", 1)], unique=True, background=True)

lt_db = LiveTests(live_tests_col)
at_db = Attempts(attempts_col)
ev_db = EventLogs(event_logs_col)

ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get('ADMIN_EMAILS', '').split(',') if e.strip()]

def is_admin():
    """Check if current user is an admin."""
    return current_user.is_authenticated and current_user.email.lower() in ADMIN_EMAILS

# ── AI result caching helpers ──────────────────────────────────────
def get_cached_ai(drive_id, cache_type):
    """Look up a cached AI result by driveId and type (flashcards/kindle/cbt).
    Returns the cached data dict or None."""
    doc = ai_cache_col.find_one({"drive_id": drive_id, "type": cache_type})
    if doc:
        return doc.get("data")
    return None

def get_cached_ai_multi(drive_ids, cache_type):
    """Look up cached AI results for multiple driveIds.
    Returns a dict mapping driveId -> cached data (only for hits)."""
    docs = ai_cache_col.find({"drive_id": {"$in": drive_ids}, "type": cache_type})
    return {doc["drive_id"]: doc["data"] for doc in docs}

def store_cached_ai(drive_id, cache_type, data):
    """Store an AI result in the cache, using upsert to avoid duplicates."""
    ai_cache_col.update_one(
        {"drive_id": drive_id, "type": cache_type},
        {"$set": {"drive_id": drive_id, "type": cache_type, "data": data, "cached_at": time.time()}},
        upsert=True
    )

@app.route("/set_avatar" , methods=["POST"])
@login_required
def set_avatar():
    if request.method == "POST":
        data = request.get_json()
        avatar_data = data.get("src")
        udb.update_avatar(current_user.username, avatar_data)
        return jsonify({"status": "success"})

@app.route("/get_avatar", methods=["POST"])
@login_required
def get_avatar():
    if request.method == "POST":
        avatar_data = udb.get_avatar(current_user.username)
        return jsonify({"status": "success", "src": avatar_data})
@app.route("/verify-otp", methods=["POST"])
def verify_otp():
 try:
    if request.method == "POST": 
     data = request.get_json()
     print(data)
     for i in otp_handler:
         if i["username"] == data.get("username").lower().strip() and int(i["otp"]) == int(data.get("otp")) and (time.time() - i["timestamp"]) <=300 and i["email"] == data.get("email").lower().strip():
             try:
                    id=udb.add_user(username=i["username"], password=i["hashed_password"], email=i["email"])
                    user = User({"_id":id,"username":i["username"].lower().strip(), "email":i["email"].lower().strip(), "password":i["hashed_password"]})
                    login_user(user, remember=i["remember"])    
                    otp_handler.remove(i)
                    print("OTP verified and user logged in")
                    return jsonify({"status":"success", "message":"OTP_VERIFIED"})
             except Exception as e:
                return jsonify({"status":"error", "message":"DB_ERROR_OR_OTP_EXPIRED"})
         else:
             return jsonify({"status":"error", "message":"DB_ERROR_OR_OTP_EXPIRED"})
 except Exception as e:
        return jsonify({"status":"error", "message":"DB_ERROR_OR_OTP_EXPIRED"})
     
## SEO ROUTES

@app.route("/robots.txt")
def robots_txt():
    robots = """User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /calendar
Disallow: /attendance
Disallow: /profile
Disallow: /notes
Disallow: /test_section
Disallow: /admin
Disallow: /live_tests
Disallow: /view_pdf/
Disallow: /login
Disallow: /signup
Disallow: /verify-otp
Disallow: /api/

Sitemap: https://shingaku.com/sitemap.xml
"""
    return Response(robots, mimetype="text/plain")

@app.route("/sitemap.xml")
def sitemap_xml():
    sitemap = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://shingaku.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
"""
    return Response(sitemap, mimetype="application/xml")

## ROUTING CODE
@app.route("/", methods=["GET", "POST"])
def home():
  if request.method == "POST":
        if current_user.is_authenticated:
            avatar = udb.get_avatar(current_user.username)
            return {"message": "LOGGED_IN", "username": current_user.username, "avatar": avatar}
        return {"message": "NOT_LOGGED_IN"}
  if request.method == "GET":
        return render_template("homepage.html")

@app.route("/login" , methods=["POST"])
def login():
  try:
    if request.method == "POST":
        print("Login Request Recieved")
        credentials = request.get_json()
        email = credentials.get("email").strip().lower()
        password = credentials.get("password").strip()
        remember = credentials.get("remember")
        print(f"Remember me: {remember}")
        usar = udb.get_user(email=email)
        if usar and check_password_hash(usar.get("password"), password):    
            user1 = User(usar)
            login_user(user1, remember=remember)
            print("User logged in")
            return jsonify({"status":"success", "message":"LOGGED_IN"})
        else:
            return jsonify({"status":"error"})
  except Exception as e:
        print(e)

@app.route("/signup", methods=["POST"])
def signup():
    if request.method == "POST":
        print("Signup request received")
        credentials = request.get_json()
        print(credentials)
        username = credentials.get("username").strip().lower()
        email = credentials.get("email").strip().lower()
        password = credentials.get("password").strip()
        if not udb.check_username(username):
            try:
                email = credentials.get("email").strip().lower()
                otp = send_email(Secrets.EMAIL, Secrets.APP_PASSWORD, email)
                hashed_password = generate_password_hash(password, method="pbkdf2:sha256")
                otp_handler.append({"username": username, "email": email, "otp": otp , "hashed_password":hashed_password, "timestamp": time.time(), "remember": credentials.get("remember")})
                return jsonify({"otp": "sent"}) ## otp sent
            except Exception as e:
                return jsonify({"error": f"Error sending email: {str(e)}"})
        else:
            return jsonify({"error": "Already Registered"})
        
@app.route("/username_check", methods=["POST"])
def username_check():
    if request.method == "POST":
        data = request.get_json()
        username = data.get("username").strip().lower()
        if udb.check_username(username):
            return jsonify({"status": "TAKEN"}) ## username taken
        else:
            return jsonify({"status": "NOT_TAKEN"}) ## username available
@app.route("/email_check", methods=["POST"])
def email_check():
    if request.method == "POST":
        data = request.get_json()
        print(data)
        email = data.get("email").strip().lower()
        if udb.check_email(email):
            return jsonify({"status": "TAKEN"})
        else:
            return jsonify({"status": "NOT_TAKEN"})
        
@app.route("/dashboard")
def dashboard():
    if current_user.is_authenticated:
        avatar = udb.get_avatar(current_user.username)
        if not avatar:
            avatar = generate_pixel_avatar(current_user.username)
            udb.update_avatar(current_user.username, avatar)
        return render_template("dashboard.html", username=current_user.username, avatar=avatar)
    else:
        return "LOGIN FIRST BITCH"
    
@app.route("/calendar")
@login_required
def calendar():
    avatar = udb.get_avatar(current_user.username)
    if not avatar:
        avatar = generate_pixel_avatar(current_user.username)
        udb.update_avatar(current_user.username, avatar)
    return render_template("calendar.html", username=current_user.username, avatar=avatar)

@app.route("/attendance")
@login_required
def attendance():
    avatar = udb.get_avatar(current_user.username)
    if not avatar:
        avatar = generate_pixel_avatar(current_user.username)
        udb.update_avatar(current_user.username, avatar)
    return render_template("attendance.html", username=current_user.username, avatar=avatar)

@app.route("/api/calendar/<month>", methods=["GET"])
@login_required
def get_calendar_month(month):
    data = udb.get_calendar_data(current_user.username, month)
    return jsonify({"status": "success", "data": data})

@app.route("/api/calendar/day/<date_key>", methods=["GET", "POST"])
@login_required
def calendar_day(date_key):
    if request.method == "GET":
        data = udb.get_calendar_day(current_user.username, date_key)
        return jsonify({"status": "success", "data": data})
    else:
        day_data = request.json
        udb.save_calendar_day(current_user.username, date_key, day_data)
        return jsonify({"status": "success"})

@app.route("/api/calendar/schedule", methods=["GET", "POST"])
@login_required
def calendar_schedule():
    if request.method == "GET":
        schedule = udb.get_user_schedule(current_user.username)
        return jsonify({"status": "success", "schedule": schedule})
    else:
        schedule = request.json.get("schedule", {})
        udb.save_user_schedule(current_user.username, schedule)
        return jsonify({"status": "success"})

@app.route("/api/calendar/schedule/upload", methods=["POST"])
@login_required
def upload_schedule():
    """Upload a photo/PDF of class schedule, parse with Gemini, and save."""
    file = request.files.get('file')
    if not file:
        return jsonify({"status": "error", "message": "No file uploaded"}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    allowed = {'pdf', 'png', 'jpg', 'jpeg', 'webp'}
    if ext not in allowed:
        return jsonify({"status": "error", "message": "Unsupported file type"}), 400

    mime_map = {'pdf': 'application/pdf', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'}
    mime = mime_map.get(ext, 'application/octet-stream')

    file_bytes = file.read()

    from google import genai
    from google.genai import types
    client = genai.Client(api_key=Secrets.GEMINI_API_KEY)

    schedule_prompt = """You are analyzing a class schedule/timetable. Extract the weekly recurring schedule.
IMPORTANT: Many timetables have GROUPS or SECTIONS (e.g., Gr.1, Gr.2, Gr.3, Group A, Group B, Section 1, etc.).
If a time slot has DIFFERENT subjects for different groups, you MUST capture ALL groups for that slot.

Return ONLY valid JSON (no markdown) with this schema:
{
  "groups": ["Gr.1", "Gr.2", "Gr.3"],
  "schedule": {
    "0": [],
    "1": [
      {
        "time": "09:00",
        "slots": [
          {"group": "Gr.1", "name": "CS-121", "type": "Lecture", "color": "#ff7b00"},
          {"group": "Gr.2", "name": "PH-102", "type": "Lecture", "color": "#00d2ff"},
          {"group": "Gr.3", "name": "HS-102", "type": "Tutorial", "color": "#8b5cf6"}
        ]
      },
      {
        "time": "10:00",
        "slots": [
          {"group": "ALL", "name": "MA-101", "type": "Lecture", "color": "#22c55e"}
        ]
      }
    ],
    "2": [...],
    "3": [...],
    "4": [...],
    "5": [...],
    "6": []
  }
}

Rules:
- "groups" is an array of ALL group/section names found in the timetable. If there are NO groups, use ["ALL"].
- Keys in "schedule" are day-of-week (0=Sunday, 1=Monday, ..., 6=Saturday).
- Each time slot has a "time" (24h HH:MM) and "slots" array.
- Each slot has: group (group name or "ALL" if the class is common to everyone), name (subject code/name), type (Lecture/Lab/Tutorial), color (unique hex per subject).
- If a class applies to ALL groups at that time, set group to "ALL".
- If a day has no classes, use an empty array.
- Assign distinct bright colors per subject: #ff7b00, #00d2ff, #8b5cf6, #22c55e, #ec4899, #f59e0b, #06b6d4, #f43f5e, #a855f7, #14b8a6."""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=[
            types.Part.from_bytes(data=file_bytes, mime_type=mime),
            schedule_prompt
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.1)
    )

    try:
        parsed = json.loads(response.text)
        # Handle new group-aware format: { "groups": [...], "schedule": {...} }
        # Also keep backward compat with old flat format: { "0": [...], ... }
        if "schedule" in parsed and "groups" in parsed:
            schedule = parsed
        else:
            # Old format — wrap into new structure
            schedule = {"groups": ["ALL"], "schedule": parsed}
        udb.save_user_schedule(current_user.username, schedule)
        return jsonify({"status": "success", "schedule": schedule})
    except json.JSONDecodeError:
        return jsonify({"status": "error", "message": "Failed to parse schedule from file"}), 500

@app.route("/api/calendar/events", methods=["GET"])
@login_required
def get_college_events():
    events = cedb.get_events()
    return jsonify({"status": "success", "events": events})

@app.route("/api/calendar/group", methods=["GET", "POST"])
@login_required
def calendar_group():
    if request.method == "GET":
        group = udb.get_user_group(current_user.username)
        return jsonify({"status": "success", "group": group})
    else:
        group = request.json.get("group", "")
        udb.save_user_group(current_user.username, group)
        return jsonify({"status": "success"})

@app.route("/api/calendar/attendance_stats", methods=["GET"])
@login_required
def attendance_stats():
    """Compute per-subject attendance stats across all calendar days.
    Supports 3-state: 'present', 'absent', 'cancelled' (and old boolean compat)."""
    username = current_user.username
    user = users.find_one({"username": username})
    cal = user.get("calendar", {}) if user else {}

    subject_stats = {}  # { subject_name: { attended: int, total: int, cancelled: int } }
    for month_key, month_data in cal.items():
        for date_key, day_data in month_data.items():
            att = day_data.get("attendance", {})
            for key, val in att.items():
                subject_name = key.rsplit("_", 1)[0] if "_" in key else key
                if subject_name not in subject_stats:
                    subject_stats[subject_name] = {"attended": 0, "total": 0, "cancelled": 0}
                # Normalize: True/'present' = present, 'cancelled' = cancelled, else absent
                if val == 'cancelled':
                    subject_stats[subject_name]["cancelled"] += 1
                else:
                    subject_stats[subject_name]["total"] += 1
                    if val is True or val == 'present':
                        subject_stats[subject_name]["attended"] += 1

    return jsonify({"status": "success", "stats": subject_stats})

@app.route("/admin/calendar/upload_events", methods=["POST"])
@login_required
def admin_upload_events():
    """Admin uploads a PDF/image of academic calendar, Gemini extracts events."""
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    file = request.files.get('file')
    if not file:
        return jsonify({"status": "error", "message": "No file uploaded"}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    allowed = {'pdf', 'png', 'jpg', 'jpeg', 'webp'}
    if ext not in allowed:
        return jsonify({"status": "error", "message": "Unsupported file type"}), 400

    mime_map = {'pdf': 'application/pdf', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'}
    mime = mime_map.get(ext, 'application/octet-stream')

    file_bytes = file.read()

    from google import genai
    from google.genai import types
    client = genai.Client(api_key=Secrets.GEMINI_API_KEY)

    events_prompt = """You are analyzing a college academic calendar. Extract ALL events, holidays, exams, and important dates.
Return ONLY valid JSON (no markdown) with this schema:
{
  "YYYY-MM-DD": [{"type": "holiday"|"event", "label": "Event Name"}],
  ...
}
Rules:
- "holiday" for official holidays, breaks, no-class days
- "event" for fests, exams, deadlines, orientations, etc.
- Use the actual year from the document
- Include ALL dates mentioned in the document
- Format dates as YYYY-MM-DD"""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=[
            types.Part.from_bytes(data=file_bytes, mime_type=mime),
            events_prompt
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.1)
    )

    try:
        events = json.loads(response.text)
        cedb.add_events(events)
        return jsonify({"status": "success", "events": events, "count": len(events)})
    except json.JSONDecodeError:
        return jsonify({"status": "error", "message": "Failed to parse events from file"}), 500

@app.route("/admin/calendar/events", methods=["GET", "DELETE"])
@login_required
def admin_manage_events():
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    if request.method == "GET":
        events = cedb.get_events()
        return jsonify({"status": "success", "events": events})
    else:
        cedb.set_events({})
        return jsonify({"status": "success"})

@app.route("/logout", methods=["POST"])
@login_required
def logout():
    if request.method == "POST":
        logout_user()
        return jsonify({"status": "success"})
    
@app.route("/get_notifications_settings", methods=["GET"])
@login_required
def notification_settings():
    if request.method == "GET":
        settings = udb.get_notification_settings(current_user.username)
        return jsonify({"status": "success", "settings": settings})
    
@app.route("/profile", methods=["GET"])
@login_required
def profile():
    username , email = current_user.username , current_user.email
    name , bio = udb.get_name(username) , udb.get_bio(username)
    roll_no = email.upper().split("@")[0]
    return render_template("profile.html", username=username, email=email,roll_no=roll_no, name=name, bio=bio, is_admin=is_admin())
def start_otp_bg():
    asyncio.run(otp_handle())

@app.route("/update_profile", methods=["POST"])
@login_required
def update_profile():
    data = request.get_json()
    name = data.get("name")
    bio = data.get("bio")
    username = current_user.username
    udb.update_name(username, name)
    udb.update_bio(username, bio)
    return jsonify({"status": "success"})

@app.route("/update/<function>", methods=["POST"])
@login_required
def update_notifications(function):
    if function == "clan":
        udb.set_clan_notifications(current_user.username, request.get_json().get("allow_clan_invites"))
    
    elif function == "exam_reminders" :
        udb.set_exam_notification(current_user.username, request.get_json().get("exam_reminders"))
    
    elif function == "todo_time":
        udb.set_todo_time_notifications(current_user.username, request.get_json().get("allow_todo_time"), request.get_json().get("to_do_time"))
    return jsonify({"status": "success"})

@app.route("/get_wake_me_up_data", methods=["GET"])
@login_required
def get_wake_me_up_data():
    data = udb.get_wake_me_up_data(current_user.username)
    return jsonify(data)


@app.route("/get_wake_me_up_settings", methods=["GET"])
@login_required
def get_wake_me_up_settings():
    data = udb.get_wake_me_up_settings(current_user.username)
    return jsonify(data)


@app.route("/set_wake_me_up", methods=["POST"])
@login_required
def set_wake_me_up_data():
    data = request.get_json()
    wake_me_up_enabled = data.get("wake_me_up_enabled", False)
    wake_me_up_settings = data.get("wake_me_up_settings", {})
    udb.set_wake_me_up_data(current_user.username, wake_me_up_enabled, wake_me_up_settings)
    return jsonify({"status": "success"})


@app.route("/update_password", methods=["POST"])
@login_required
def update_password():
    data = request.get_json()
    oldpass = data.get("oldpass")
    newpass = data.get("newpass")
    username = current_user.username
    user = udb.get_user_by_username(username=username)
    print(current_user.password)
    if user and check_password_hash(str(current_user.password), oldpass):
        hashed_password = generate_password_hash(newpass, method="pbkdf2:sha256")
        udb.update_password(username, hashed_password)
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error"})

@app.route("/delete_account_verify", methods=["POST"])
@login_required
def delete_account_verify():
    try:
        data = request.get_json()
        password = data.get("password", "").strip()
        if not password:
            return jsonify({"status": "error", "message": "PASSWORD_REQUIRED"})
        if not check_password_hash(str(current_user.password), password):
            return jsonify({"status": "error", "message": "INVALID_PASSWORD"})
        otp = send_delete_email(Secrets.EMAIL, Secrets.APP_PASSWORD, current_user.email)
        otp_handler.append({
            "username": current_user.username,
            "email": current_user.email,
            "otp": otp,
            "timestamp": time.time(),
            "action": "delete_account"
        })
        return jsonify({"status": "success", "message": "OTP_SENT"})
    except Exception as e:
        print(e)
        return jsonify({"status": "error", "message": "SERVER_ERROR"})

@app.route("/delete_account_confirm", methods=["POST"])
@login_required
def delete_account_confirm():
    try:
        data = request.get_json()
        otp_input = data.get("otp", "").strip()
        if not otp_input:
            return jsonify({"status": "error", "message": "OTP_REQUIRED"})
        for i in otp_handler:
            if (i.get("action") == "delete_account"
                and i["username"] == current_user.username
                and i["email"] == current_user.email
                and int(i["otp"]) == int(otp_input)
                and (time.time() - i["timestamp"]) <= 300):
                udb.delete_user(current_user.username)
                otp_handler.remove(i)
                logout_user()
                return jsonify({"status": "success", "message": "ACCOUNT_DELETED"})
        return jsonify({"status": "error", "message": "INVALID_OR_EXPIRED_OTP"})
    except Exception as e:
        print(e)
        return jsonify({"status": "error", "message": "SERVER_ERROR"})

@app.route("/notes")
@login_required
def notes():
    avatar = udb.get_avatar(current_user.username)
    if not avatar:
        avatar = generate_pixel_avatar(current_user.username)
        udb.update_avatar(current_user.username, avatar)
    return render_template("notes.html", avatar=avatar)

@app.route("/test_section")
@login_required
def test_section():
    return render_template("test_section.html")

@app.route("/pdf_to_cbt", methods=["POST"])
@login_required
def pdf_to_cbt_route():
    if 'pdf' not in request.files:
        return jsonify({"status": "error", "message": "No PDF file uploaded"}), 400
    pdf_file = request.files['pdf']
    if pdf_file.filename == '':
        return jsonify({"status": "error", "message": "No file selected"}), 400
    try:
        result = pdf_to_cbt(pdf_file)
        session_id = str(uuid.uuid4())
        cbt_image_sessions[session_id] = {
            'images_dir': result['images_dir'],
            'pdf_path': os.path.join(result.get('tmp_dir', ''), 'upload.pdf'),
            'tmp_dir': result.get('tmp_dir')
        }
        return render_template("test.html", exam_data=result['exam_data'], images_session=session_id, extracted_files=result.get('extracted_files', []))
    except Exception as e:
        import traceback
        traceback.print_exc()
        app.logger.error(f"PDF to CBT error: {e}\n{traceback.format_exc()}")
        return jsonify({"status": "error", "message": f"Failed to process PDF: {str(e)}"}), 500

# ── Global Google Drive token (authenticated once by admin, used by everyone) ──
GOOGLE_TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'google_token.json')

def load_google_creds():
    """Load global Google Drive credentials from stored token file."""
    if not os.path.exists(GOOGLE_TOKEN_FILE):
        return None
    with open(GOOGLE_TOKEN_FILE, 'r') as f:
        token_data = json.load(f)
    creds = Credentials(
        token=token_data.get('access_token'),
        refresh_token=token_data.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=os.environ.get('GOOGLE_CLIENT_ID'),
        client_secret=os.environ.get('GOOGLE_CLIENT_SECRET')
    )
    # Auto-refresh if expired
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        save_google_creds(creds)
    return creds

def save_google_creds(creds):
    """Save Google Drive credentials to file for global use."""
    with open(GOOGLE_TOKEN_FILE, 'w') as f:
        json.dump({
            'access_token': creds.token,
            'refresh_token': creds.refresh_token
        }, f)

@app.route("/drive_to_cbt", methods=["POST"])
@login_required
def drive_to_cbt_route():
    data = request.get_json()
    drive_id = data.get('driveId') if data else None
    if not drive_id or not all(c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in drive_id):
        return jsonify({"status": "error", "message": "Invalid Drive ID"}), 400
    creds = load_google_creds()
    if not creds:
        return jsonify({"status": "auth_required", "driveId": drive_id}), 401
    try:
        print(f"[drive_to_cbt] Downloading Drive file: {drive_id}")
        service = build('drive', 'v3', credentials=creds)
        request_dl = service.files().get_media(fileId=drive_id)
        tmp_dir = tempfile.mkdtemp()
        pdf_path = os.path.join(tmp_dir, 'drive_download.pdf')
        with open(pdf_path, 'wb') as f:
            downloader = MediaIoBaseDownload(f, request_dl)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        print(f"[drive_to_cbt] Downloaded PDF to {pdf_path} ({os.path.getsize(pdf_path)} bytes)")

        # Check cache for Gemini extraction
        cached = get_cached_ai(drive_id, "cbt")
        if cached:
            print(f"[drive_to_cbt] Cache HIT for {drive_id}")
            exam_data = cached.get('exam_data', {})
            image_coordinates = cached.get('image_coordinates', [])
        else:
            print(f"[drive_to_cbt] Cache MISS — calling Gemini for {drive_id}")
            raw_response = send_pdf_to_gemini(pdf_path, extraction_prompt)
            print(f"[drive_to_cbt] Gemini raw response (first 500 chars): {raw_response[:500]}")
            exam_data = json.loads(raw_response)
            image_coordinates = exam_data.pop('image_coordinates', [])
            # Store in cache (exam_data without image_coordinates + image_coordinates separately)
            store_cached_ai(drive_id, "cbt", {"exam_data": exam_data, "image_coordinates": image_coordinates})

        images_dir = os.path.join(tmp_dir, 'images')
        extracted_files = extract_images_from_pdf(pdf_path, images_dir, image_coordinates)
        session_id = str(uuid.uuid4())
        cbt_image_sessions[session_id] = {
            'images_dir': images_dir,
            'pdf_path': pdf_path,
            'tmp_dir': tmp_dir
        }
        return render_template("test.html", exam_data=exam_data, images_session=session_id, extracted_files=extracted_files)
    except Exception as e:
        print(f"Drive to CBT error: {e}")
        if 'invalid_grant' in str(e).lower() or 'invalid credentials' in str(e).lower():
            # Token expired/revoked — need re-auth
            if os.path.exists(GOOGLE_TOKEN_FILE):
                os.remove(GOOGLE_TOKEN_FILE)
            return jsonify({"status": "auth_required"}), 401
        return jsonify({"status": "error", "message": "Failed to process PDF"}), 500

@app.route("/generate_flashcards", methods=["POST"])
@login_required
def generate_flashcards_route():
    """Accept one or more driveIds, download PDFs from Drive, generate flashcards via Gemini (with cache)."""
    data = request.get_json()
    drive_ids = data.get('driveIds') if data else None
    if not drive_ids or not isinstance(drive_ids, list) or len(drive_ids) == 0:
        return jsonify({"status": "error", "message": "No PDFs selected"}), 400

    for did in drive_ids:
        if not did or not all(c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in did):
            return jsonify({"status": "error", "message": "Invalid Drive ID"}), 400

    drive_ids = drive_ids[:5]

    # Check cache for all requested driveIds
    cached = get_cached_ai_multi(drive_ids, "flashcards")
    uncached_ids = [did for did in drive_ids if did not in cached]

    all_flashcards = []
    source_title = ""

    # Collect cached flashcards first
    for did in drive_ids:
        if did in cached:
            cards_data = cached[did]
            print(f"[flashcards] Cache HIT for {did}")
            all_flashcards.extend(cards_data.get('flashcards', []))
            if not source_title:
                source_title = cards_data.get('source_title', '')

    # Only call Gemini + download for uncached PDFs
    if uncached_ids:
        creds = load_google_creds()
        if not creds:
            return jsonify({"status": "auth_required"}), 401

        try:
            service = build('drive', 'v3', credentials=creds)

            for drive_id in uncached_ids:
                print(f"[flashcards] Cache MISS — downloading Drive file: {drive_id}")
                request_dl = service.files().get_media(fileId=drive_id)
                tmp_dir = tempfile.mkdtemp()
                pdf_path = os.path.join(tmp_dir, 'drive_download.pdf')
                with open(pdf_path, 'wb') as f:
                    downloader = MediaIoBaseDownload(f, request_dl)
                    done = False
                    while not done:
                        _, done = downloader.next_chunk()

                print(f"[flashcards] Downloaded PDF to {pdf_path} ({os.path.getsize(pdf_path)} bytes)")
                raw_response = generate_flashcards_from_pdf(pdf_path)
                print(f"[flashcards] Gemini response (first 500 chars): {raw_response[:500]}")
                cards_data = json.loads(raw_response)
                all_flashcards.extend(cards_data.get('flashcards', []))
                if not source_title:
                    source_title = cards_data.get('source_title', '')

                # Store in cache
                store_cached_ai(drive_id, "flashcards", cards_data)

                shutil.rmtree(tmp_dir, ignore_errors=True)

        except Exception as e:
            print(f"[flashcards] Error: {e}")
            if 'invalid_grant' in str(e).lower() or 'invalid credentials' in str(e).lower():
                if os.path.exists(GOOGLE_TOKEN_FILE):
                    os.remove(GOOGLE_TOKEN_FILE)
                return jsonify({"status": "auth_required"}), 401
            return jsonify({"status": "error", "message": f"Failed to generate flashcards: {str(e)}"}), 500

    for idx, card in enumerate(all_flashcards):
        card['id'] = idx + 1

    return jsonify({
        "status": "success",
        "source_title": source_title,
        "total_cards": len(all_flashcards),
        "flashcards": all_flashcards
    })

@app.route("/kindle_mode", methods=["POST"])
@login_required
def kindle_mode_route():
    """Accept a single driveId, download PDF from Drive, extract structured content via Gemini (with cache)."""
    data = request.get_json()
    drive_id = data.get('driveId') if data else None
    if not drive_id or not all(c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in drive_id):
        return jsonify({"status": "error", "message": "Invalid Drive ID"}), 400

    # Check cache first
    cached = get_cached_ai(drive_id, "kindle")
    if cached:
        print(f"[kindle] Cache HIT for {drive_id}")
        return jsonify({"status": "success", "content": cached})

    creds = load_google_creds()
    if not creds:
        return jsonify({"status": "auth_required"}), 401

    try:
        print(f"[kindle] Cache MISS — downloading Drive file: {drive_id}")
        service = build('drive', 'v3', credentials=creds)
        request_dl = service.files().get_media(fileId=drive_id)
        tmp_dir = tempfile.mkdtemp()
        pdf_path = os.path.join(tmp_dir, 'drive_download.pdf')
        with open(pdf_path, 'wb') as f:
            downloader = MediaIoBaseDownload(f, request_dl)
            done = False
            while not done:
                _, done = downloader.next_chunk()

        print(f"[kindle] Downloaded PDF to {pdf_path} ({os.path.getsize(pdf_path)} bytes)")
        raw_response = extract_kindle_content(pdf_path)
        print(f"[kindle] Gemini response (first 500 chars): {raw_response[:500]}")
        kindle_data = json.loads(raw_response)

        # Extract diagram regions from PDF as base64 images (before cleanup)
        extract_kindle_diagrams(pdf_path, kindle_data)

        shutil.rmtree(tmp_dir, ignore_errors=True)

        # Store in cache
        store_cached_ai(drive_id, "kindle", kindle_data)

        return jsonify({
            "status": "success",
            "content": kindle_data
        })

    except Exception as e:
        print(f"[kindle] Error: {e}")
        if 'invalid_grant' in str(e).lower() or 'invalid credentials' in str(e).lower():
            if os.path.exists(GOOGLE_TOKEN_FILE):
                os.remove(GOOGLE_TOKEN_FILE)
            return jsonify({"status": "auth_required"}), 401
        return jsonify({"status": "error", "message": f"Failed to extract content: {str(e)}"}), 500

@app.route("/google/auth")
@login_required
def google_auth():
    drive_id = request.args.get('driveId', '')
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": os.environ.get('GOOGLE_CLIENT_ID'),
                "client_secret": os.environ.get('GOOGLE_CLIENT_SECRET'),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token"
            }
        },
        scopes=['https://www.googleapis.com/auth/drive.readonly'],
        redirect_uri=url_for('google_callback', _external=True)
    )
    auth_url, state = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        login_hint='25bec063@nith.ac.in'
    )
    session['oauth_state'] = state
    session['oauth_drive_id'] = drive_id
    session['oauth_code_verifier'] = flow.code_verifier
    return redirect(auth_url)

@app.route("/google/callback")
@login_required
def google_callback():
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": os.environ.get('GOOGLE_CLIENT_ID'),
                "client_secret": os.environ.get('GOOGLE_CLIENT_SECRET'),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token"
            }
        },
        scopes=['https://www.googleapis.com/auth/drive.readonly'],
        redirect_uri=url_for('google_callback', _external=True)
    )
    flow.code_verifier = session.pop('oauth_code_verifier', None)
    flow.fetch_token(authorization_response=request.url)
    credentials = flow.credentials
    # Save globally — all users will use this token
    save_google_creds(credentials)
    print(f"[google_callback] Google Drive token saved globally")
    drive_id = session.pop('oauth_drive_id', '')
    return redirect(url_for('test_section') + ('?autoCBT=' + drive_id if drive_id else ''))

@app.route("/cbt_images/<session_id>/<filename>")
@login_required
def serve_cbt_image(session_id, filename):
    session_data = cbt_image_sessions.get(session_id)
    images_dir = session_data.get('images_dir') if isinstance(session_data, dict) else session_data
    if not images_dir or not os.path.isdir(images_dir):
        return "Not found", 404
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(images_dir, safe_filename)
    if os.path.exists(file_path):
        resp = send_from_directory(images_dir, safe_filename)
        resp.headers['Cache-Control'] = 'private, max-age=3600, immutable'
        return resp
    # Fallback: match by stem with any extension (figure_1.png -> figure_1.*)
    import glob
    stem = os.path.splitext(safe_filename)[0]
    matches = glob.glob(os.path.join(images_dir, stem + '.*'))
    if matches:
        resp = send_from_directory(images_dir, os.path.basename(matches[0]))
        resp.headers['Cache-Control'] = 'private, max-age=3600, immutable'
        return resp
    return "Not found", 404

@app.route("/evaluate_exam", methods=["POST"])
@login_required
def evaluate_exam_route():
    try:
        data = request.get_json()
        exam_data = data.get("exam_data")
        user_answers = data.get("user_answers")
        time_taken = data.get("time_taken", 0)

        if not exam_data or user_answers is None:
            return jsonify({"status": "error", "message": "Missing data"}), 400

        user_answers["time_taken_seconds"] = time_taken

        # Retrieve PDF path from session for re-sending to Gemini
        session_id = data.get("session_id")
        pdf_path = None
        if session_id:
            session_data = cbt_image_sessions.get(session_id)
            if isinstance(session_data, dict):
                pdf_path = session_data.get('pdf_path')
                if pdf_path and not os.path.exists(pdf_path):
                    pdf_path = None

        raw = evaluate_answers(exam_data, user_answers, pdf_path=pdf_path)
        evaluation = json.loads(raw)

        # Clean up temp directory now that evaluation is done
        if session_id and session_id in cbt_image_sessions:
            session_data_cbt = cbt_image_sessions.pop(session_id)
            tmp_dir = session_data_cbt.get('tmp_dir')
            if tmp_dir and os.path.isdir(tmp_dir):
                shutil.rmtree(tmp_dir, ignore_errors=True)
                print(f"[cleanup] Removed temp dir: {tmp_dir}")

        # Save to database
        test_record = {
            "exam_title": exam_data.get("exam", {}).get("title", "Unknown Exam"),
            "timestamp": time.time(),
            "time_taken_seconds": time_taken,
            "total_score": evaluation.get("total_score", 0),
            "max_score": evaluation.get("max_score", 0),
            "percentage": evaluation.get("percentage", 0),
            "correct_count": evaluation.get("correct_count", 0),
            "wrong_count": evaluation.get("wrong_count", 0),
            "unattempted_count": evaluation.get("unattempted_count", 0),
            "grade": evaluation.get("grade", "D"),
            "rank_title": evaluation.get("rank_title", "Academy Student"),
            "total_questions": len(exam_data.get("questions", [])),
            "questions": evaluation.get("questions", []),
            "weaknesses": evaluation.get("weaknesses", [])
        }
        udb.save_test_result(current_user.username, test_record)

        return jsonify({"status": "success", "evaluation": evaluation})
    except Exception as e:
        print(f"Evaluate exam error: {e}")
        return jsonify({"status": "error", "message": "Evaluation failed"}), 500

@app.route("/test_history", methods=["GET"])
@login_required
def test_history_route():
    history = udb.get_test_history(current_user.username)
    # Strip questions from list view for performance
    summary = []
    for h in history:
        entry = {k: v for k, v in h.items() if k not in ('questions', 'weaknesses')}
        entry['has_details'] = bool(h.get('questions'))
        summary.append(entry)
    return jsonify({"status": "success", "history": summary})

@app.route("/test_history/<int:index>", methods=["GET"])
@login_required
def test_history_detail(index):
    history = udb.get_test_history(current_user.username)
    if index < 0 or index >= len(history):
        return jsonify({"status": "error", "message": "Not found"}), 404
    return jsonify({"status": "success", "test": history[index]})

@app.route("/test_history/<int:index>", methods=["DELETE"])
@login_required
def delete_test_history(index):
    success = udb.delete_test_result(current_user.username, index)
    if not success:
        return jsonify({"status": "error", "message": "Not found"}), 404
    return jsonify({"status": "success"})


@app.route("/view_pdf/<drive_id>")
@login_required
def view_pdf(drive_id):
    """Proxy a Google Drive PDF through the server using global admin creds."""
    if not drive_id or not all(c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in drive_id):
        return "Invalid ID", 400
    creds = load_google_creds()
    if not creds:
        return "Google Drive not configured", 503
    try:
        service = build('drive', 'v3', credentials=creds)
        # Get filename for download
        file_meta = service.files().get(fileId=drive_id, fields='name').execute()
        filename = file_meta.get('name', 'document.pdf')
        request_dl = service.files().get_media(fileId=drive_id)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request_dl)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buf.seek(0)
        is_download = request.args.get('download') == '1'
        response = app.response_class(buf.read(), mimetype='application/pdf')
        if is_download:
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        else:
            response.headers['Content-Disposition'] = 'inline'
        response.headers['Cache-Control'] = 'private, max-age=3600'
        return response
    except Exception as e:
        print(f"[view_pdf] Error: {e}")
        return "Failed to load PDF", 500


# ══════════════════════════════════════════════════════════════
#  Admin Routes
# ══════════════════════════════════════════════════════════════

@app.route("/admin")
@login_required
def admin_panel():
    if not is_admin():
        return "Unauthorized", 403
    return render_template("admin.html")


@app.route("/admin/extract_pdf", methods=["POST"])
@login_required
def admin_extract_pdf():
    """Admin uploads a PDF, Gemini extracts questions, returns them for review."""
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    if 'pdf' not in request.files:
        return jsonify({"status": "error", "message": "No PDF uploaded"}), 400
    pdf_file = request.files['pdf']
    if pdf_file.filename == '':
        return jsonify({"status": "error", "message": "No file selected"}), 400
    try:
        result = pdf_to_cbt(pdf_file)
        exam_data = result['exam_data']
        raw_questions = exam_data.get('questions', [])
        exam_meta = exam_data.get('exam', {})

        # Map Gemini schema → live test schema
        questions = []
        for q in raw_questions:
            mapped = {
                "question": q.get("question", {"text": "", "images": []}),
                "options": q.get("options", []),
                "marks": q.get("marks", 1),
                "negative_marks": q.get("negative_marks", 0),
                "type": q.get("type", "mcq"),
            }
            # Map correct_answer → correct_option
            ca = q.get("correct_answer", [])
            if isinstance(ca, list) and len(ca) == 1:
                mapped["correct_option"] = ca[0]
            elif isinstance(ca, list) and len(ca) > 1:
                mapped["correct_options"] = ca
            elif isinstance(ca, str):
                mapped["correct_option"] = ca
            questions.append(mapped)

        return jsonify({
            "status": "success",
            "questions": questions,
            "exam": exam_meta,
            "source_filename": pdf_file.filename,
        })
    except Exception as e:
        print(f"[live_tests] PDF extract error: {e}")
        return jsonify({"status": "error", "message": f"Failed to extract questions from PDF: {str(e)}"}), 500


@app.route("/admin/create", methods=["POST"])
@login_required
def admin_create_test():
    """Admin uploads a test JSON with schedule."""
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No data provided"}), 400

        # Validate required fields
        title = data.get("title", "").strip()
        questions = data.get("questions", [])
        schedule = data.get("schedule", {})

        if not title:
            return jsonify({"status": "error", "message": "Title is required"}), 400
        if not questions:
            return jsonify({"status": "error", "message": "Questions array is required"}), 400
        if not schedule.get("start_time") or not schedule.get("window_end") or not schedule.get("duration_minutes"):
            return jsonify({"status": "error", "message": "Schedule (start_time, window_end, duration_minutes) required"}), 400

        test_doc = {
            "title": title,
            "description": data.get("description", ""),
            "questions": questions,
            "schedule": {
                "start_time": float(schedule["start_time"]),
                "window_end": float(schedule["window_end"]),
                "duration_minutes": int(schedule["duration_minutes"])
            },
            "total_marks": data.get("total_marks", sum(q.get("marks", 0) for q in questions)),
            "negative_marking": data.get("negative_marking", 0),
            "created_by": current_user.username
        }

        test_id = lt_db.create_test(test_doc)

        # Store hash on blockchain (async-safe)
        test_data = lt_db.get_test(test_id)
        content_hash = test_data.get("content_hash", "")
        tx_hash = store_hash_on_chain(content_hash)
        if tx_hash:
            lt_db.store_blockchain_hash(test_id, tx_hash)

        # Auto-send notification for new live test
        start_dt = time.strftime("%b %d, %I:%M %p", time.localtime(float(schedule["start_time"])))
        notifications_col.insert_one({
            "title": f"📝 New Live Test: {title}",
            "message": f"{len(questions)} questions · {schedule['duration_minutes']}min · Starts {start_dt}",
            "icon": "radio",
            "created_at": time.time(),
            "created_by": current_user.username,
            "type": "live_test"
        })

        return jsonify({"status": "success", "test_id": test_id, "content_hash": content_hash})
    except Exception as e:
        print(f"[live_tests] Create error: {e}")
        return jsonify({"status": "error", "message": "Failed to create test"}), 500


@app.route("/admin/list", methods=["GET"])
@login_required
def admin_list_tests():
    """Get all tests for admin dashboard."""
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    tests = lt_db.get_all_tests()
    result = []
    for t in tests:
        t["_id"] = str(t["_id"])
        # Count attempts
        attempts = at_db.get_attempts_for_test(t["_id"])
        t["attempt_count"] = len(attempts)
        t["submitted_count"] = sum(1 for a in attempts if a["status"] == "submitted")
        t["cheating_count"] = sum(1 for a in attempts if a["status"] == "cheating")
        result.append(t)
    return jsonify({"status": "success", "tests": result})


@app.route("/admin/test/<test_id>", methods=["GET"])
@login_required
def admin_test_detail(test_id):
    """Get detailed view of a test with all attempts."""
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    test = lt_db.get_test(test_id)
    if not test:
        return jsonify({"status": "error", "message": "Test not found"}), 404
    test["_id"] = str(test["_id"])
    attempts = at_db.get_attempts_for_test(test_id)
    for a in attempts:
        a["_id"] = str(a["_id"])
    test["attempts"] = attempts
    return jsonify({"status": "success", "test": test})


@app.route("/admin/delete/<test_id>", methods=["DELETE"])
@login_required
def admin_delete_test(test_id):
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    lt_db.delete_test(test_id)
    return jsonify({"status": "success"})


@app.route("/admin/verify/<test_id>", methods=["GET"])
@login_required
def admin_verify_test(test_id):
    """Verify test integrity against blockchain."""
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    test = lt_db.get_test(test_id)
    if not test:
        return jsonify({"status": "error", "message": "Test not found"}), 404
    result = verify_integrity(test.get("content_hash", ""), test.get("questions", []))
    return jsonify({"status": "success", "integrity": result})


@app.route("/admin/send_notification", methods=["POST"])
@login_required
def admin_send_notification():
    """Admin sends a notification to all users."""
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    data = request.get_json()
    title = data.get("title", "").strip()
    message = data.get("message", "").strip()
    icon = data.get("icon", "bell")
    if not title or not message:
        return jsonify({"status": "error", "message": "Title and message required"}), 400
    doc = {
        "title": title,
        "message": message,
        "icon": icon,
        "created_at": time.time(),
        "created_by": current_user.username,
        "type": "admin"
    }
    notifications_col.insert_one(doc)
    return jsonify({"status": "success"})


@app.route("/admin/notifications", methods=["GET"])
@login_required
def admin_list_notifications():
    """Admin views all sent notifications."""
    if not is_admin():
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    notifs = list(notifications_col.find().sort("created_at", -1).limit(50))
    for n in notifs:
        n["_id"] = str(n["_id"])
    return jsonify({"status": "success", "notifications": notifs})


@app.route("/notifications", methods=["GET"])
@login_required
def get_notifications():
    """Student fetches recent notifications."""
    user = udb.get_user_by_username(current_user.username)
    dismissed = user.get("dismissed_notifications", []) if user else []
    notifs = list(notifications_col.find().sort("created_at", -1).limit(30))
    result = []
    for n in notifs:
        nid = str(n["_id"])
        if nid not in dismissed:
            result.append({
                "_id": nid,
                "title": n.get("title", ""),
                "message": n.get("message", ""),
                "icon": n.get("icon", "bell"),
                "type": n.get("type", "admin"),
                "created_at": n.get("created_at", 0)
            })
    return jsonify({"status": "success", "notifications": result})


@app.route("/notifications/dismiss", methods=["POST"])
@login_required
def dismiss_notification():
    """Student dismisses a notification."""
    data = request.get_json()
    nid = data.get("id", "")
    if nid:
        udb.user.update_one(
            {"username": current_user.username},
            {"$addToSet": {"dismissed_notifications": nid}}
        )
    return jsonify({"status": "success"})


# ══════════════════════════════════════════════════════════════
#  LIVE TESTS — Student Routes
# ══════════════════════════════════════════════════════════════

@app.route("/live_tests")
@login_required
def live_tests_list():
    """Student view — list available live tests."""
    return render_template("live_tests.html")


@app.route("/live_tests/available", methods=["GET"])
@login_required
def live_tests_available():
    """API: Get tests visible to the student (active, upcoming, and recently expired)."""
    now = time.time()
    tests = lt_db.get_all_tests()
    result = []
    for t in tests:
        # Check if student already attempted
        existing = at_db.get_student_attempt(current_user.username, str(t["_id"]))
        result.append({
            "_id": str(t["_id"]),
            "title": t["title"],
            "description": t.get("description", ""),
            "schedule": t["schedule"],
            "total_marks": t.get("total_marks", 0),
            "question_count": len(t.get("questions", [])),
            "status": t["status"],
            "already_attempted": existing is not None,
            "attempt_status": existing["status"] if existing else None
        })
    return jsonify({"status": "success", "tests": result})


@app.route("/live_tests/start/<test_id>", methods=["POST"])
@login_required
def live_tests_start(test_id):
    """Student starts a live test attempt."""
    now = time.time()
    test = lt_db.get_test(test_id)
    if not test:
        return jsonify({"status": "error", "message": "Test not found"}), 404

    schedule = test.get("schedule", {})

    # Check time window
    if now < schedule.get("start_time", 0):
        return jsonify({"status": "error", "message": "Test has not started yet"}), 403
    if now > schedule.get("window_end", 0):
        return jsonify({"status": "error", "message": "Start window has closed"}), 403

    # Check for existing attempt
    existing = at_db.get_student_attempt(current_user.username, test_id)
    if existing:
        if existing["status"] == "in_progress":
            # Resume existing attempt
            return jsonify({
                "status": "success",
                "attempt_id": str(existing["_id"]),
                "test": {
                    "title": test["title"],
                    "questions": test["questions"],
                    "duration_minutes": schedule.get("duration_minutes", 60),
                    "total_marks": test.get("total_marks", 0),
                    "negative_marking": test.get("negative_marking", 0)
                },
                "existing_answers": existing.get("answers", {}),
                "start_time": existing["start_time"],
                "resumed": True
            })
        return jsonify({"status": "error", "message": "You have already attempted this test"}), 403

    # Create new attempt
    attempt_id = at_db.start_attempt(current_user.username, test_id)
    ev_db.log_event(current_user.username, test_id, attempt_id, "EXAM_STARTED")

    # Strip correct answers from questions sent to client
    client_questions = []
    for q in test["questions"]:
        cq = {k: v for k, v in q.items() if k not in ("correct_answer", "correct_option", "answer")}
        client_questions.append(cq)

    return jsonify({
        "status": "success",
        "attempt_id": attempt_id,
        "test": {
            "title": test["title"],
            "questions": client_questions,
            "duration_minutes": schedule.get("duration_minutes", 60),
            "total_marks": test.get("total_marks", 0),
            "negative_marking": test.get("negative_marking", 0)
        },
        "start_time": time.time(),
        "resumed": False
    })


@app.route("/live_tests/submit/<attempt_id>", methods=["POST"])
@login_required
def live_tests_submit(attempt_id):
    """Student submits their answers."""
    attempt = at_db.get_attempt(attempt_id)
    if not attempt:
        return jsonify({"status": "error", "message": "Attempt not found"}), 404
    if attempt["student_id"] != current_user.username:
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
    if attempt["status"] != "in_progress":
        return jsonify({"status": "error", "message": "Attempt already finalized"}), 400

    data = request.get_json()
    answers = data.get("answers", {})

    # Fetch the test to grade
    test = lt_db.get_test(attempt["test_id"])
    if not test:
        return jsonify({"status": "error", "message": "Test not found"}), 404

    # Grade the answers
    score = 0
    max_score = 0
    correct_count = 0
    wrong_count = 0
    results = []

    for i, q in enumerate(test.get("questions", [])):
        q_marks = q.get("marks", 1)
        neg = test.get("negative_marking", 0)
        max_score += q_marks
        user_ans = answers.get(str(i))
        correct = q.get("correct_option") or q.get("correct_answer") or q.get("answer")

        is_correct = False
        if user_ans is not None and correct is not None:
            if str(user_ans).strip().lower() == str(correct).strip().lower():
                is_correct = True
                score += q_marks
                correct_count += 1
            else:
                score -= neg
                wrong_count += 1

        results.append({
            "question_index": i,
            "user_answer": user_ans,
            "correct_answer": correct,
            "is_correct": is_correct,
            "marks": q_marks if is_correct else (-neg if user_ans else 0)
        })

    score = max(0, score)
    submission_hash = at_db.submit_answers(attempt_id, answers, score)

    # Store submission hash on blockchain
    tx_hash = store_hash_on_chain(submission_hash)
    if tx_hash:
        at_db.store_blockchain_hash(attempt_id, tx_hash)

    ev_db.log_event(current_user.username, attempt["test_id"], attempt_id, "EXAM_SUBMITTED")

    return jsonify({
        "status": "success",
        "score": score,
        "max_score": max_score,
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "unattempted": len(test["questions"]) - correct_count - wrong_count,
        "percentage": round((score / max_score * 100) if max_score > 0 else 0, 1),
        "results": results,
        "submission_hash": submission_hash
    })


@app.route("/live_tests/event", methods=["POST"])
@login_required
def live_tests_log_event():
    """Log an anti-cheat event from the client."""
    data = request.get_json()
    attempt_id = data.get("attempt_id", "")
    event_type = data.get("event_type", "")
    details = data.get("details", "")
    test_id = data.get("test_id", "")

    if not attempt_id or not event_type:
        return jsonify({"status": "error"}), 400

    # Validate the attempt belongs to this user
    attempt = at_db.get_attempt(attempt_id)
    if not attempt or attempt["student_id"] != current_user.username:
        return jsonify({"status": "error"}), 403

    ev_db.log_event(current_user.username, test_id, attempt_id, event_type, details)

    # Check if event should terminate the exam
    terminate_events = {"FULLSCREEN_EXIT_MAX", "MULTI_TAB_DETECTED"}
    if event_type in terminate_events:
        at_db.mark_cheating(attempt_id, event_type)
        return jsonify({"status": "terminated", "reason": event_type})

    return jsonify({"status": "logged"})


@app.route("/live_tests/exam/<test_id>")
@login_required
def live_tests_exam_page(test_id):
    """Render the exam page (client-side will call /start to get questions)."""
    test = lt_db.get_test(test_id)
    if not test:
        return "Test not found", 404
    return render_template("live_test_exam.html", test_id=test_id, test_title=test["title"])


@app.route("/skills")
@login_required
def skills():
    avatar = udb.get_avatar(current_user.username)
    if not avatar:
        avatar = generate_pixel_avatar(current_user.username)
        udb.update_avatar(current_user.username, avatar)
    return render_template("skills.html", username=current_user.username, avatar=avatar)

@app.route("/api/skills/generate_roadmap", methods=["POST"])
@login_required
def generate_roadmap():
    data = request.get_json()
    speciality = data.get("speciality", "").strip()
    if not speciality:
        return jsonify({"status": "error", "message": "No speciality provided"}), 400

    from google import genai
    from google.genai import types
    client = genai.Client(api_key=Secrets.GEMINI_API_KEY)

    prompt = f"""You are an expert learning roadmap architect. The user wants to master: "{speciality}".

Create a COMPREHENSIVE, MODULAR (non-linear) learning roadmap. The roadmap is a directed graph — modules can have multiple prerequisites, and learners can explore parallel branches.

Return ONLY valid JSON (no markdown) with this schema:
{{
  "title": "Roadmap title",
  "description": "2-3 sentence overview of this learning path and what the learner will be able to do after completing it",
  "modules": [
    {{
      "id": "unique_id",
      "name": "Module name",
      "description": "2-3 sentences describing what this module covers and WHY it matters in the bigger picture",
      "category": "One of: foundation | core | specialization | project | advanced",
      "estimated_hours": 40,
      "prerequisites": ["id_of_prerequisite_module"],
      "topics": [
        {{
          "name": "Specific topic name",
          "description": "What this topic covers in detail — concepts, tools, frameworks",
          "difficulty": "beginner | intermediate | advanced",
          "resources": {{
            "books": [
              {{"title": "Book Title", "author": "Author Name", "url": "https://openlibrary.org/search?q=BOOK+TITLE+ENCODED"}}
            ],
            "courses": [
              {{"title": "Course Title", "platform": "Platform Name", "url": "https://..."}}
            ],
            "youtube": [
              {{"title": "Playlist/Video Title", "channel": "Channel Name", "url": "https://youtube.com/..."}}
            ]
          }}
        }}
      ]
    }}
  ]
}}

CRITICAL RULES:
1. MODULAR GRAPH STRUCTURE: Create 8-15 modules. NOT a flat linear list. Some modules share prerequisites (branching). Some modules are parallel (can be learned in any order). Use "prerequisites" arrays to define the dependency graph. The first modules should have empty prerequisites []. Later modules reference earlier module ids.
2. CATEGORIES: Use "foundation" for absolute basics, "core" for essential knowledge, "specialization" for branching paths, "project" for hands-on capstone modules, "advanced" for expert-level topics.
3. DEPTH: Each module should have 3-6 specific topics. Topics should be granular — not vague like "learn databases" but specific like "PostgreSQL indexing strategies, query optimization, EXPLAIN plans".
4. RESOURCES:
   - Books: Link to OpenLibrary search https://openlibrary.org/search?q=ENCODED+TITLE. Pick well-known, highly-rated textbooks.
   - Courses: Free platforms ONLY — freeCodeCamp, MIT OCW, Coursera (free audit), Khan Academy, edX, The Odin Project, CS50, NPTEL, fast.ai, fullstackopen.com.
   - YouTube: Real popular channels/playlists (Fireship, Traversy Media, 3Blue1Brown, Sentdex, CS Dojo, The Coding Train, Tech With Tim, NetworkChuck, etc).
   - Each topic gets 2-3 books, 2-3 courses, 2-3 YouTube links.
5. ESTIMATED HOURS: Provide realistic self-study hour estimates per module.
6. Make the roadmap INDUSTRY-RELEVANT for 2025-2026 — include modern tools, frameworks, and practices."""

    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=[prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.3)
        )
        parsed = json.loads(response.text)
        return jsonify({"status": "success", "roadmap": parsed})
    except json.JSONDecodeError:
        return jsonify({"status": "error", "message": "Failed to parse roadmap"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    Thread(target=start_otp_bg, daemon=True).start()
    app.run(debug=True)