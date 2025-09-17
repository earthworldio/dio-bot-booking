sleep 2

# สร้าง user-data สำหรับบอท
user_data_dir="./user-data"
mkdir -p "$user_data_dir"

echo "📁 Create user-data success ✅ "

# อ่าน port จาก .env หรือใช้ default
CHROME_PORT=${CHROME_DEBUG_PORT:-9222}

# Start Chrome
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=$CHROME_PORT \
  --user-data-dir="$user_data_dir" \
  --no-first-run \
  --no-default-browser-check \
  --disable-default-apps \
  --disable-popup-blocking \
  --disable-web-security \
  --disable-features=VizDisplayCompositor \
  --disable-logging \
  --silent \
  --disable-gpu-logging \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-background-networking \
  --disable-sync \
  --disable-translate \
  --disable-plugins \
  --disable-extensions \
  --disable-images \
  --disable-javascript-harmony-shipping \
  --disable-webgl \
  --disable-3d-apis \
  --disable-gpu \
  --disable-software-rasterizer \
  --disable-dev-shm-usage \
  --disable-setuid-sandbox \
  --no-sandbox \
  --aggressive-cache-discard \
  --memory-pressure-off \
  --max_old_space_size=4096 \
  --js-flags="--max-old-space-size=4096" \
  > /dev/null 2>&1 &

# เก็บ PID ของ Chrome
CHROME_PID=$!

sleep 2

if kill -0 $CHROME_PID 2>/dev/null; then
    echo "Chrome started ✅ " 
else
    echo "Chrome started failed ❌ "
    exit 1
fi  