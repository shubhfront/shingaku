import re


## if you want to add more colleges support mess up with the regex of check email remove that nith.ac.in  
def is_strong_password(password):
    PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,64}$")
    return bool(PASSWORD_REGEX.match(password))

def check_username(username: str):
    pattern = r'^[a-zA-Z][a-zA-Z0-9_]{2,19}$'
    return bool(re.match(pattern, username))

def check_email(email:str):
    pattern = r"^25(bar|bcs|bec|bee|bme|bce|bch|bma|bph|bms|dcs|dec)[0-9]{3}@nith\.ac\.in$"
    return bool(re.match(pattern, email))

