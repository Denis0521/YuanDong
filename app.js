// ==================== 您的專屬憑證資訊 ====================
const CLIENT_ID = '130737953356-9t11ein5pe6l7ihvmbnm39jeg9beel9s.apps.googleusercontent.com';
// ============================================================

let tokenClient;
let accessToken = null;
let spreadsheetId = null;
let folderId = null;
let cloudImageData = { fileId1:'', fileId2:'', fileId3:'', fileId4:'' };

// 監聽網頁載入
window.addEventListener('load', () => {
    // 1. 註冊 PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('Service Worker 註冊成功'))
            .catch(err => console.error('Service Worker 註冊失敗', err));
    }
    
    // 2. 初始化 Google Identity Services 驗證客戶端
    if (typeof google !== 'undefined') {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
            callback: async (tokenResponse) => {
                if (tokenResponse.error !== undefined) {
                    alert('❌ Google 授權失敗：' + tokenResponse.error);
                    return;
                }
                accessToken = tokenResponse.access_token;
                
                // 更新登入 UI 狀態
                const loginBtn = document.getElementById('loginBtn');
                loginBtn.innerText = '🟢 已連線雲端';
                loginBtn.style.backgroundColor = '#34a853';
                
                showLoading('🚀 正在初始化個人雲端資料庫...');
                await initEnvironment();
            },
        });
    }

    // 初始化座號同步
    document.getElementById('seatNumber').value = document.getElementById('ctrlSeat').value;
    document.getElementById('ctrlSeat').addEventListener('change', function() {
        document.getElementById('seatNumber').value = this.value;
    });
});

// 觸發 Google 登入
function handleAuthClick() {
    if (tokenClient) {
        tokenClient.requestAccessToken();
    } else {
        alert('Google SDK 載入中，請重新嘗試。');
    }
}

// 通用 Google REST API 呼叫方法
async function fetchGoogleAPI(url, options = {}) {
    if (!accessToken) {
        hideLoading();
        alert('⚠️ 請先完成「Google 帳號登入」授權！');
        throw new Error('未獲得權限');
    }
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = `Bearer ${accessToken}`;
    
    const response = await fetch(url, options);
    if (!response.ok) {
        const errDetails = await response.text();
        console.error('API Error:', errDetails);
        throw new Error(`狀態碼: ${response.status}`);
    }
    return response.json();
}

// 建立或連接專屬的資料庫與相片資料夾
async function initEnvironment() {
    try {
        // 1. 搜尋雲端硬碟內是否已有該名老師的「試算表資料庫」
        const qSheet = "name='幼兒學習區紀錄資料庫' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
        const sheetSearch = await fetchGoogleAPI(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qSheet)}`);
        
        if (sheetSearch.files && sheetSearch.files.length > 0) {
            spreadsheetId = sheetSearch.files[0].id;
        } else {
            // 找不到則自動在個人雲端硬碟建立
            const createSheet = await fetchGoogleAPI('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: '幼兒學習區紀錄資料庫',
                    mimeType: 'application/vnd.google-apps.spreadsheet'
                })
            });
            spreadsheetId = createSheet.id;
            
            // 初始化試算表表頭
            await fetchGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:E1?valueInputOption=USER_ENTERED`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: [["座號", "班級", "姓名", "最後更新時間", "資料備註"]] })
            });
        }

        // 2. 搜尋是否已有「相片備份資料夾」
        const qFolder = "name='幼兒相片雲端備份庫' and mimeType='application/vnd.google-apps.folder' and trashed=false";
        const folderSearch = await fetchGoogleAPI(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qFolder)}`);
        
        if (folderSearch.files && folderSearch.files.length > 0) {
            folderId = folderSearch.files[0].id;
        } else {
            const createFolder = await fetchGoogleAPI('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: '幼兒相片雲端備份庫',
                    mimeType: 'application/vnd.google-apps.folder'
                })
            });
            folderId = createFolder.id;
        }
        hideLoading();
    } catch (err) {
        hideLoading();
        alert('❌ 初始化個人雲端空間失敗：' + err.message);
    }
}

// 圖片前端壓縮與直傳
function processImage(event, index) {
    const file = event.target.files[0];
    if (!file) return;
    
    const seatNum = document.getElementById('ctrlSeat').value || '未知';
    const stuName = document.getElementById('studentName').value || '未命名';
    const className = document.getElementById('className').value || '無班級';
    const fileName = `${className}_${seatNum}號_${stuName}_區${index}.jpg`;

    showLoading('📸 正在壓縮圖片並上傳至您的 Google Drive...');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 600; 
            let width = img.width, height = img.height;
            if (width > height) {
                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            document.getElementById('img' + index).src = dataUrl;
            document.getElementById('img' + index).style.display = 'block';
            document.getElementById('ph' + index).style.display = 'none';
            document.getElementById('del' + index).style.display = 'block';
            
            // 轉換為 Blob 物件
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            
            await uploadImageToDrive(blob, fileName, index);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// 透過 Google Drive Multipart API 進行單檔直傳
async function uploadImageToDrive(blob, filename, imgIndex) {
    try {
        if (!folderId) await initEnvironment();
        
        const metadata = {
            name: filename,
            parents: [folderId],
            mimeType: 'image/jpeg'
        };
        
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', blob);
        
        const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: formData
        });
        
        if (!uploadResponse.ok) throw new Error('雲端上傳失敗');
        const fileData = await uploadResponse.json();
        
        cloudImageData['fileId' + imgIndex] = fileData.id;
        hideLoading();
    } catch (err) {
        hideLoading();
        alert('❌ 圖片儲存至雲端失敗：' + err.message);
    }
}

// 【更新】支援雲端刪除的移除相片功能
async function removeImage(index, event) {
    event.preventDefault();
    event.stopPropagation(); // 防止點擊按鈕時觸發到底下的上傳按鈕
    
    const fileId = cloudImageData['fileId' + index];
    
    // 如果雲端有這張照片，先詢問是否連同雲端檔案一起刪除
    if (fileId) {
        if (!confirm('確定要移除這張照片嗎？(將同時從 Google 雲端硬碟永久刪除)')) {
            return; // 使用者按取消則不動作
        }
        
        showLoading('🗑️ 正在從雲端刪除照片...');
        try {
            // 呼叫 Google Drive API 執行刪除
            await fetchGoogleAPI(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                method: 'DELETE'
            });
        } catch(e) {
            console.log('檔案可能已不在雲端', e);
        }
        hideLoading();
    }
    
    // 清空前端畫面與暫存變數
    document.getElementById('img' + index).src = '';
    document.getElementById('img' + index).style.display = 'none';
    document.getElementById('del' + index).style.display = 'none';
    document.getElementById('ph' + index).style.display = 'block';
    document.getElementById('ph' + index).innerText = '輕觸上傳相片 (區' + index + ')';
    document.getElementById('file' + index).value = '';
    cloudImageData['fileId' + index] = '';
}

function getFormData() {
    const data = {
        year: document.getElementById('year').value, 
        term: document.getElementById('term').value,
        className: document.getElementById('className').value, 
        studentName: document.getElementById('studentName').value,
        seatNumber: document.getElementById('ctrlSeat').value, 
        recordDate: document.getElementById('recordDate').value,
        cb1: document.getElementById('cb1').checked, 
        cb2: document.getElementById('cb2').checked,
        cb3: document.getElementById('cb3').checked, 
        cb4: document.getElementById('cb4').checked,
        cb5: document.getElementById('cb5').checked, 
        cb6: document.getElementById('cb6').checked,
        teacherName: document.getElementById('teacherName').value,
    };
    for(let i=1; i<=4; i++) {
        data['pd'+i] = document.getElementById('pd'+i).value;
        data['pdesc'+i] = document.getElementById('pdesc'+i).value;
        data['pab'+i] = document.getElementById('pab'+i).value;
        data['fileId'+i] = cloudImageData['fileId'+i];
    }
    return data;
}

// 儲存表單資料至雲端試算表
async function cloudSave() {
    const data = getFormData();
    if (!data.seatNumber || !data.studentName) { 
        alert("⚠️ 儲存前請務必填寫「座號」與「幼生姓名」！"); 
        return; 
    }
    
    showLoading("🚀 正在儲存資料至個人雲端試算表...");
    try {
        if (!spreadsheetId) await initEnvironment();
        
        // 抓取目前的全部資料確認是否需要覆蓋原有座號
        const readRes = await fetchGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:E`);
        const values = readRes.values || [];
        let rowIndex = -1;
        
        for (let r = 1; r < values.length; r++) {
            if (values[r][0] == data.seatNumber) { 
                rowIndex = r + 1; // 轉為試算表從 1 開始的行數
                break; 
            }
        }
        
        const jsonStr = JSON.stringify(data);
        const rowData = [ data.seatNumber, data.className, data.studentName, new Date().toLocaleString(), jsonStr ];
        
        if (rowIndex > -1) {
            // 覆蓋已有帳目
            await fetchGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A${rowIndex}:E${rowIndex}?valueInputOption=USER_ENTERED`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: [rowData] })
            });
        } else {
            // 新增一行
            await fetchGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:E:append?valueInputOption=USER_ENTERED`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: [rowData] })
            });
        }
        
        hideLoading();
        alert(`✅ 座號 ${data.seatNumber} 號 (${data.studentName}) 的紀錄已安全存入您的雲端硬碟！`);
    } catch (err) {
        hideLoading();
        alert("❌ 儲存失敗：" + err.message);
    }
}

// 從個人試算表載入資料並讀取相片
async function cloudLoad() {
    const targetSeat = document.getElementById('ctrlSeat').value.trim();
    if (!targetSeat) { alert("請輸入想要下載的座號"); return; }
    
    document.getElementById('seatNumber').value = targetSeat;
    showLoading(`📥 正在從您的雲端讀取第 ${targetSeat} 號的紀錄與相片...`);
    
    try {
        if (!spreadsheetId) await initEnvironment();
        
        const readRes = await fetchGoogleAPI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:E`);
        const values = readRes.values || [];
        let targetData = null;
        
        for (let r = 1; r < values.length; r++) {
            if (values[r][0] == targetSeat) {
                targetData = JSON.parse(values[r][4]);
                break;
            }
        }
        
        if (!targetData) {
            hideLoading();
            alert(`您的雲端庫中尚未建立 ${targetSeat} 號的資料。`);
            return;
        }
        
        // 回填文字表單資料
        if (targetData.year) document.getElementById('year').value = targetData.year;
        if (targetData.term) document.getElementById('term').value = targetData.term;
        if (targetData.className) document.getElementById('className').value = targetData.className;
        if (targetData.teacherName) document.getElementById('teacherName').value = targetData.teacherName;
        document.getElementById('studentName').value = targetData.studentName || '';
        document.getElementById('recordDate').value = targetData.recordDate || '';
        
        for(let c=1; c<=6; c++) {
            document.getElementById('cb'+c).checked = targetData['cb'+c] || false;
        }
        
        // 【更新】填回各區的文字說明與重點能力
        for(let i=1; i<=4; i++) {
            if (targetData['pd'+i]) document.getElementById('pd'+i).value = targetData['pd'+i];
            if (targetData['pdesc'+i]) document.getElementById('pdesc'+i).value = targetData['pdesc'+i];
            if (targetData['pab'+i]) document.getElementById('pab'+i).value = targetData['pab'+i];
        }
        
        // 讀取相片二進位資料並轉為 Base64
        for (let i = 1; i <= 4; i++) {
            const fileId = targetData['fileId' + i];
            const imgEl = document.getElementById('img' + i);
            const phEl = document.getElementById('ph' + i);
            const delEl = document.getElementById('del' + i);
            
            if (fileId) {
                try {
                    // 直接用 alt=media 下載檔案的二進位內容
                    const mediaResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (!mediaResponse.ok) throw new Error();
                    const blob = await mediaResponse.blob();
                    
                    const objectURL = URL.createObjectURL(blob);
                    imgEl.src = objectURL;
                    imgEl.style.display = 'block';
                    phEl.style.display = 'none';
                    delEl.style.display = 'block';
                    cloudImageData['fileId' + i] = fileId;
                } catch (e) {
                    // 若相片已被刪除或無法讀取
                    imgEl.src = '';
                    imgEl.style.display = 'none';
                    phEl.innerText = '⚠️ 相片讀取失敗';
                    phEl.style.display = 'block';
                    delEl.style.display = 'none';
                }
            } else {
                imgEl.src = '';
                imgEl.style.display = 'none';
                phEl.innerText = '輕觸上傳相片 (區' + i + ')';
                phEl.style.display = 'block';
                delEl.style.display = 'none';
                cloudImageData['fileId' + i] = '';
            }
        }
        hideLoading();
    } catch (err) {
        hideLoading();
        alert("❌ 載入失敗：" + err.message);
    }
}

function clearForm() {
    if(confirm('⚠️ 確定要清除目前畫面上輸入的所有文字與照片嗎？(已存雲端的資料不受影響)')) {
        document.getElementById('studentName').value = '';
        document.getElementById('recordDate').value = '';
        document.getElementById('teacherName').value = '';
        for(let c=1; c<=6; c++) document.getElementById('cb'+c).checked = false;
        for(let i=1; i<=4; i++) {
            document.getElementById('pd'+i).value = '';
            document.getElementById('pdesc'+i).value = '';
            document.getElementById('pab'+i).value = '';
            document.getElementById('img'+i).src = '';
            document.getElementById('img'+i).style.display = 'none';
            document.getElementById('ph'+i).innerText = '輕觸上傳相片 (區' + i + ')';
            document.getElementById('ph'+i).style.display = 'block';
            document.getElementById('del'+i).style.display = 'none';
            document.getElementById('file'+i).value = '';
            cloudImageData['fileId'+i] = '';
        }
    }
}

function showLoading(text) { 
    document.getElementById('loaderText').innerHTML = text; 
    document.getElementById('loader').style.display = 'flex';
}
function hideLoading() { 
    document.getElementById('loader').style.display = 'none';
}