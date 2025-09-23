sleep 1

# สร้าง user-data สำหรับบอท
user_data_dir="${CHROME_USER_DATA_DIR:-./user-data}"
mkdir -p "$user_data_dir"
echo "📁 Create user-data success ✅ "

# อ่าน port จาก .env หรือใช้ default
CHROME_PORT=${CHROME_DEBUG_PORT:-9222}

# หา Chrome path
if [ -n "$CHROME_PATH" ]; then
  CHROME_BIN="$CHROME_PATH"
elif [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
  CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
else
  # ลองค้นหาโดยใช้ mdfind แล้วประกอบพาธให้ถูกต้อง (ไม่มี backslash)
  CHROME_APP=$(mdfind "kMDItemCFBundleIdentifier == 'com.google.Chrome'" | head -n 1)
  if [ -n "$CHROME_APP" ] && [ -x "$CHROME_APP/Contents/MacOS/Google Chrome" ]; then
    CHROME_BIN="$CHROME_APP/Contents/MacOS/Google Chrome"
  fi
fi

echo "ใช้ Chrome: $CHROME_BIN"

if [ -z "$CHROME_BIN" ] || [ ! -x "$CHROME_BIN" ]; then
  echo "ไม่พบ Google Chrome — โปรดกำหนด CHROME_PATH ใน .env"
  exit 1
fi

# Start Chrome ด้วย flags ที่จำเป็นขั้นต่ำ
"$CHROME_BIN" \
  --remote-debugging-port=$CHROME_PORT \
  --user-data-dir="$user_data_dir" \
  --no-first-run \
  --no-default-browser-check \
  --disable-logging \
  --password-store=basic \
  --use-mock-keychain \
  --new-window \
  "about:blank" \
  &

# เก็บ PID ของ Chrome (อาจจบเร็วถ้าไปเปิดใน session เดิม)
CHROME_PID=$!

# รอให้ remote debugging endpoint ตอบกลับ
TRIES=10
SLEEP=0.5
for i in $(seq 1 $TRIES); do
  if command -v curl >/dev/null 2>&1; then
    if curl -sf "http://localhost:$CHROME_PORT/json/version" >/dev/null 2>&1; then
      echo "Chrome started ✅ "
      exit 0
    fi
  fi
  sleep $SLEEP
done

echo "Chrome started failed ❌ "
exit 1