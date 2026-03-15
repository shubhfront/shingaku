import smtplib, random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

html ="""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Shingaku Verification</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#050505;
  font-family: 'Segoe UI', Arial, sans-serif;
">

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:50px 12px;">

        <table width="420" cellpadding="0" cellspacing="0" style="
          background:linear-gradient(180deg, #0b0b0b, #121212);
          border-radius:14px;
          box-shadow:0 0 40px rgba(255,120,0,0.25);
        ">

          <tr>
            <td style="padding:34px; text-align:center; color:#ffffff;">

              <!-- LOGO / TITLE -->
              <h1 style="
                margin:0;
                font-size:30px;
                letter-spacing:4px;
                font-weight:700;
              ">
                SHINGAKU
              </h1>

              <p style="
                margin:6px 0 30px;
                font-size:13px;
                letter-spacing:2px;
                color:#ff8c00;
              ">
                進学 • AUTHORIZATION REQUIRED
              </p>

              <!-- MESSAGE -->
              <p style="
                font-size:15px;
                color:#cccccc;
                line-height:1.6;
                margin-bottom:24px;
              ">
                A disturbance has been detected at the gate.<br>
                Prove your intent to proceed.
              </p>

              <!-- OTP BOX -->
              <div style="
                margin:26px auto;
                padding:20px 0;
                width:100%;
                border:1px solid #ff8c00;
                border-radius:12px;
                font-size:36px;
                letter-spacing:8px;
                font-weight:700;
                color:#ff8c00;
                background:rgba(255,140,0,0.05);
              ">
                {OTP}
              </div>

              <!-- FOOTER -->
              <p style="
                font-size:13px;
                color:#aaaaaa;
                margin-top:26px;
              ">
                This code fades in <strong>5 minutes</strong>.
              </p>

              <p style="
                font-size:12px;
                color:#666666;
                margin-top:24px;
                line-height:1.5;
              ">
                If you did not initiate this request,<br>
                remain still — the gate will stay sealed.
              </p>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>

"""

delete_html = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Shingaku — Account Deletion</title>
</head>
<body style="
  margin:0;
  padding:0;
  background:#050505;
  font-family: 'Segoe UI', Arial, sans-serif;
">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:50px 12px;">
        <table width="420" cellpadding="0" cellspacing="0" style="
          background:linear-gradient(180deg, #0b0b0b, #121212);
          border-radius:14px;
          box-shadow:0 0 40px rgba(220,38,38,0.35);
        ">
          <tr>
            <td style="padding:34px; text-align:center; color:#ffffff;">

              <h1 style="
                margin:0;
                font-size:30px;
                letter-spacing:4px;
                font-weight:700;
              ">
                SHINGAKU
              </h1>

              <p style="
                margin:6px 0 20px;
                font-size:13px;
                letter-spacing:2px;
                color:#dc2626;
              ">
                進学 • ACCOUNT DELETION REQUEST
              </p>

              <!-- WARNING BANNER -->
              <div style="
                margin:0 auto 20px;
                padding:14px 18px;
                width:90%;
                border:1px solid #dc2626;
                border-radius:8px;
                background:rgba(220,38,38,0.08);
                text-align:center;
              ">
                <p style="
                  margin:0;
                  font-size:14px;
                  font-weight:700;
                  color:#ef4444;
                  letter-spacing:1px;
                ">
                  ⚠ WARNING — IRREVERSIBLE ACTION
                </p>
                <p style="
                  margin:8px 0 0;
                  font-size:12px;
                  color:#fca5a5;
                  line-height:1.6;
                ">
                  Entering this code will permanently erase your account,<br>
                  all data, and every record from our archives.
                </p>
              </div>

              <p style="
                font-size:15px;
                color:#cccccc;
                line-height:1.6;
                margin-bottom:20px;
              ">
                Someone requested to delete your Shingaku account.<br>
                If this was you, enter the code below to confirm.
              </p>

              <!-- OTP BOX -->
              <div style="
                margin:26px auto;
                padding:20px 0;
                width:100%;
                border:1px solid #dc2626;
                border-radius:12px;
                font-size:36px;
                letter-spacing:8px;
                font-weight:700;
                color:#dc2626;
                background:rgba(220,38,38,0.05);
              ">
                {OTP}
              </div>

              <p style="
                font-size:13px;
                color:#aaaaaa;
                margin-top:26px;
              ">
                This code expires in <strong>5 minutes</strong>.
              </p>

              <p style="
                font-size:12px;
                color:#666666;
                margin-top:24px;
                line-height:1.5;
              ">
                If you did not request this,<br>
                ignore this email — your account will remain safe.
              </p>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

## OTP VERIFICATION 

def send_email(EMAIL, APP_PASSWORD, receiver_email):
    msg = MIMEMultipart()
    msg["From"] = EMAIL
    msg["To"] = receiver_email
    msg["Subject"] = "OTP Verification By Shingaku"
    otp = random.randint(100000, 999999)
    msg.attach(MIMEText(html.format(OTP=otp), "html"))
    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login(EMAIL, APP_PASSWORD)
    server.send_message(msg)
    server.quit()
    print("Email sent ✅")
    return otp

def send_delete_email(EMAIL, APP_PASSWORD, receiver_email):
    msg = MIMEMultipart()
    msg["From"] = EMAIL
    msg["To"] = receiver_email
    msg["Subject"] = "⚠ Account Deletion — Shingaku"
    otp = random.randint(100000, 999999)
    msg.attach(MIMEText(delete_html.format(OTP=otp), "html"))
    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login(EMAIL, APP_PASSWORD)
    server.send_message(msg)
    server.quit()
    print("Delete email sent ✅")
    return otp




    