// --- 1. ตั้งค่าการเชื่อมต่อ ThingsBoard ---
const TB_SERVER = 'https://thingsboard.cloud';
const USERNAME = 'pasit.thn@spumail.net';
const PASSWORD = 'pasit0504';
const DEVICE_ID = '58640390-e10d-11f1-ba8b-c1a2c9300913';
const TELEMETRY_KEYS = 'gas_mv';
const DANGER_THRESHOLD = 3400;

let jwtToken = '';
let alertCount = 0;
let notiHistory = [];
let smokeChart = null;
let pollingInterval = null;
let hasAlerted = false; // ล็อกไม่ให้แจ้งเตือนซ้ำจนกว่าค่าจะลดลง

// --- 2. ควบคุมการเปลี่ยนหน้าและการตั้งค่า ---
function switchPage(pageId, element) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');
    if (element) element.classList.add('active');
}

function saveSettings() {
    const newName = document.getElementById('input-device-name').value.trim();
    if (newName) {
        document.getElementById('display-device-name').innerText = newName;
        const msgBox = document.getElementById('save-success-msg');
        msgBox.style.display = 'block';
        setTimeout(() => msgBox.style.display = 'none', 3000);
    }
}

function testAlertSimulation() {
    hasAlerted = false;
    processSensorData(3850);
}

// --- 3. ระบบแจ้งเตือน (กระดิ่ง Dropdown & Popup) ---
function toggleNotiDropdown(e) {
    e.stopPropagation();
    document.getElementById('noti-dropdown').classList.toggle('active');
}

window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('noti-dropdown');
    if (dropdown && !e.target.closest('.notification-wrapper') && dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
    }
});

function clearNoti() {
    notiHistory = [];
    alertCount = 0;
    updateNotiUI();
    document.getElementById('dash-alert-count').innerHTML = '0 <span style="font-size: 16px; font-weight: normal; color: var(--text-gray);">ครั้ง (วันนี้)</span>';
}

function updateNotiUI() {
    const listEl = document.getElementById('noti-list');
    const badgeEl = document.getElementById('noti-badge');
    badgeEl.innerText = alertCount;

    if (notiHistory.length === 0) {
        listEl.innerHTML = '<div class="noti-empty">ไม่มีการแจ้งเตือนใหม่</div>';
        badgeEl.style.display = 'none';
    } else {
        badgeEl.style.display = 'block';
        listEl.innerHTML = notiHistory.map(item => `
            <div class="noti-item">
                <div class="noti-message"><span>🚨</span> ตรวจพบค่าผิดปกติ: ${item.value} mV</div>
                <div class="noti-time">เวลา: ${item.time}</div>
            </div>
        `).join('');
    }
}

function triggerAlert(value, time) {
    if (document.getElementById('alert-modal').classList.contains('active')) return;
    alertCount++;
    document.getElementById('dash-alert-count').innerHTML = `${alertCount} <span style="font-size: 16px; font-weight: normal; color: var(--text-gray);">ครั้ง (วันนี้)</span>`;

    notiHistory.unshift({ value, time });
    if (notiHistory.length > 15) notiHistory.pop();
    updateNotiUI();

    document.getElementById('popup-value').innerText = `${value} mV`;
    document.getElementById('popup-time').innerText = time;
    document.getElementById('alert-modal').classList.add('active');
}

function closePopup() {
    document.getElementById('alert-modal').classList.remove('active');
}

// --- 4. อัปเดตสถานะหน้าจอและกราฟ ---
function setUIState(color, globalText, hwText) {
    document.getElementById('global-led').className = `led ${color}`;
    document.getElementById('hw-led').className = `led ${color}`;
    document.getElementById('global-status-text').innerText = globalText;
    document.getElementById('hw-status-text').innerText = hwText;

    const deviceStatusText = document.getElementById('device-status-text');
    if (color === 'green') {
        deviceStatusText.innerText = 'ค่าแก๊สปกติ';
        deviceStatusText.style.color = 'var(--green)';
    } else if (color === 'red') {
        deviceStatusText.innerText = 'อันตราย! แก๊สเกินกำหนด';
        deviceStatusText.style.color = 'var(--red)';
    } else {
        deviceStatusText.innerText = 'รอข้อมูลจากเซ็นเซอร์...';
        deviceStatusText.style.color = 'var(--text-gray)';
    }
}

function addDataToChart(time, value) {
    if (!smokeChart) return;
    if (smokeChart.data.labels.length > 12) {
        smokeChart.data.labels.shift();
        smokeChart.data.datasets[0].data.shift();
    }
    smokeChart.data.labels.push(time);
    smokeChart.data.datasets[0].data.push(value);
    smokeChart.update();
}

function processSensorData(value) {
    const timeNow = new Date().toLocaleTimeString('th-TH');
    document.getElementById('dash-smoke-val').innerText = `${value} mV`;
    document.getElementById('device-smoke-val').innerText = `${value} mV`;
    addDataToChart(timeNow, value);

    if (value > DANGER_THRESHOLD) {
        setUIState('red', "อันตราย! พบแก๊ส/ควันรั่วไหล", "Danger (แจ้งเตือนอันตราย)");
        
        // เด้งแจ้งเตือนแค่ครั้งแรกที่เกิน 3400 mV
        if (!hasAlerted) {
            triggerAlert(value, timeNow);
            hasAlerted = true;
        }
    } else {
        setUIState('green', "ระบบทำงานปกติ - สถานะปลอดภัย", "Safe (ปลอดภัย)");
        
        // รีเซ็ตสถานะกลับไปเริ่มใหม่เมื่อค่าลดลงมาไม่เกิน 3400 mV
        hasAlerted = false;
    }
}

// --- 5. เริ่มต้นระบบและเชื่อมต่อ ThingsBoard ---
window.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof Chart !== 'undefined') {
            const ctx = document.getElementById('smokeChart').getContext('2d');
            let gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

            smokeChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: ' ปริมาณควัน / แก๊ส (mV)',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: gradient,
                        borderWidth: 3,
                        pointBackgroundColor: '#ffffff',
                        pointBorderColor: '#3b82f6',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
                }
            });
        }
    } catch (err) {
        console.warn("ไม่สามารถสร้างกราฟได้:", err);
    }

    setUIState('yellow', 'รอเชื่อมต่อ ThingsBoard...', 'Waiting...');
    loginThingsBoard();
});

async function loginThingsBoard() {
    const statusText = document.getElementById('global-status-text');
    try {
        const response = await fetch(`${TB_SERVER}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD })
        });

        if (response.ok) {
            const data = await response.json();
            jwtToken = data.token;
            document.getElementById('device-online-status').innerHTML = '🟢 เชื่อมต่อแล้ว (Online)';
            document.getElementById('device-online-status').style.color = 'var(--green)';
            
            fetchTelemetry();
            if (!pollingInterval) {
                pollingInterval = setInterval(fetchTelemetry, 3000);
            }
        } else {
            statusText.innerText = `ล็อกอินไม่ผ่าน (Error ${response.status}: เช็กอีเมล/รหัสผ่าน)`;
        }
    } catch (error) {
        statusText.innerText = `เชื่อมต่อไม่ได้ (กรุณาเปิดผ่าน Live Server หรือเช็กอินเทอร์เน็ต)`;
        console.error("รายละเอียด Error:", error);
    }
}

async function fetchTelemetry() {
    if (!jwtToken) return;
    try {
        const response = await fetch(`${TB_SERVER}/api/plugins/telemetry/DEVICE/${DEVICE_ID}/values/timeseries?keys=${TELEMETRY_KEYS}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'X-Authorization': `Bearer ${jwtToken}` }
        });

        if (response.status === 401) {
            await loginThingsBoard();
            return;
        }

        if (response.ok) {
            const data = await response.json();
            if (data.gas_mv && data.gas_mv.length > 0) {
                const latestValue = parseFloat(data.gas_mv[0].value);
                processSensorData(latestValue);
            }
        }
    } catch (error) {
        console.error("ดึงข้อมูลผิดพลาด:", error);
    }
}