/**
 * Tracking Forwarding Agent — Server-side (Google Apps Script)
 * Entry point + Porlor proxy with enhanced security
 */

function doGet(e) {
    // ===== API mode: เรียกจากเว็บภายนอก (GitHub Pages) =====
    if (e && e.parameter && e.parameter.action === 'porlor') {
        const trackingNum = e.parameter.tracking || '';
        const result = getPorlorTracking(trackingNum);
        return ContentService.createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && e.parameter.action === 'scg') {
        const trackingNum = e.parameter.tracking || '';
        const result = getScgTracking(trackingNum);
        return ContentService.createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // ===== Default: serve HTML page (GAS Web App mode) =====
    return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('Tracking Forwarding Agent')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Validate tracking number format
 * @param {string} trackingNumber
 * @returns {{valid: boolean, error: string}}
 */
function validateTrackingNumber(trackingNumber) {
    if (!trackingNumber || typeof trackingNumber !== 'string') {
        return { valid: false, error: 'กรุณากรอกหมายเลข tracking' };
    }

    const trimmed = trackingNumber.trim();

    if (trimmed.length < 3 || trimmed.length > 50) {
        return { valid: false, error: 'หมายเลข tracking ต้องมีความยาว 3-50 ตัวอักษร' };
    }

    if (!/^[a-zA-Z0-9\-_]+$/.test(trimmed)) {
        return { valid: false, error: 'หมายเลข tracking ต้องเป็นตัวอักษร ตัวเลข หรือเครื่องหมาย - _ เท่านั้น' };
    }

    return { valid: true, error: '' };
}

/**
 * ดึงข้อมูล tracking จาก Porlor (RFE) ผ่าน server-side
 * แก้ไข link ลายเซ็นให้ถูกต้อง + sanitize content อย่างเข้มงวด
 */
function getPorlorTracking(trackingNumber) {
    try {
        // Input validation
        const validation = validateTrackingNumber(trackingNumber);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const cleanNumber = trackingNumber.trim();

        const res = UrlFetchApp.fetch('https://rfe.co.th/hc_rfeweb/trackingweb/search', {
            method: 'post',
            payload: {
                'awb': '',
                'trackID': cleanNumber,
                'page_no': '1',
                'per_page': '10'
            },
            muteHttpExceptions: true,
            followRedirects: true
        });

        const code = res.getResponseCode();
        let html = res.getContentText();

        if (code !== 200 || !html || html.length < 10) {
            return { success: false, error: 'Porlor response code: ' + code };
        }

        // ===== Enhanced HTML Sanitization =====

        // Strip dangerous elements entirely
        html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
        html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
        html = html.replace(/<link[^>]*>/gi, '');
        html = html.replace(/<nav[\s\S]*?<\/nav>/gi, '');
        html = html.replace(/<header[\s\S]*?<\/header>/gi, '');
        html = html.replace(/<footer[\s\S]*?<\/footer>/gi, '');
        html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
        html = html.replace(/<iframe[^>]*\/?>/gi, '');
        html = html.replace(/<object[\s\S]*?<\/object>/gi, '');
        html = html.replace(/<embed[^>]*\/?>/gi, '');
        html = html.replace(/<svg[\s\S]*?<\/svg>/gi, '');
        html = html.replace(/<form[\s\S]*?<\/form>/gi, '');
        html = html.replace(/<meta[^>]*>/gi, '');
        html = html.replace(/<base[^>]*>/gi, '');

        // Strip ALL event handler attributes (on*)
        html = html.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
        html = html.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');
        html = html.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

        // Strip javascript: URIs
        html = html.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
        html = html.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
        html = html.replace(/src\s*=\s*"javascript:[^"]*"/gi, 'src=""');
        html = html.replace(/src\s*=\s*'javascript:[^']*'/gi, "src=''");

        // Strip data: URIs (potential XSS vector)
        html = html.replace(/src\s*=\s*"data:[^"]*"/gi, 'src=""');
        html = html.replace(/src\s*=\s*'data:[^']*'/gi, "src=''");

        // ===== Fix Porlor-specific content =====

        // แก้ลิงก์ "ดูลายเซ็น" — onclick popupwindow → เปิดหน้าลายเซ็นตรงๆ
        html = html.replace(
            /href="#"\s*onclick="popupwindow\('([^']+)'\)"\s*/g,
            'href="https://rfe.co.th/hc_rfeweb/Trackingweb/popupImg?AWB_CODE=$1" target="_blank" '
        );

        // แก้ URL รูปลายเซ็น relative → absolute
        html = html.replace(/src="\.\.\/new_mobile_upload\//g, 'src="https://www.rfe.co.th/new_mobile_upload/');
        html = html.replace(/https:\/\/www\.rfe\.co\.th\/hc_rfeweb\/\.\.\/new_mobile_upload\//g, 'https://www.rfe.co.th/new_mobile_upload/');

        // แก้ prettyPhoto → เปิด tab ใหม่
        html = html.replace(/rel="prettyPhoto\[gallery1\]"/g, 'target="_blank"');

        // แก้ relative href/src → absolute
        html = html.replace(/href="\/hc_rfeweb\//g, 'href="https://rfe.co.th/hc_rfeweb/');
        html = html.replace(/src="\/hc_rfeweb\//g, 'src="https://rfe.co.th/hc_rfeweb/');
        html = html.replace(/href="\//g, 'href="https://rfe.co.th/');
        html = html.replace(/src="\//g, 'src="https://rfe.co.th/');

        // Minimal inline styling for modal display
        html = '<style>table{width:100%;border-collapse:collapse;}td,th{border:1px solid #ddd;padding:8px;text-align:left;}a{color:#d32f2f;}</style>'
            + html;

        return { success: true, html: html };
    } catch (e) {
        return { success: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' };
    }
}

/**
 * ดึงข้อมูล tracking จาก SCG (JWD) ผ่าน server-side
 * ใช้ SCG internal API: POST /nx/API/get_tracking
 */
function getScgTracking(trackingNumber) {
    try {
        // Input validation
        const validation = validateTrackingNumber(trackingNumber);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const cleanNumber = trackingNumber.trim();
        const SCG_TOKEN = 'd25506a134038d76baf6aacb693d899b';

        const res = UrlFetchApp.fetch('https://www.scgjwd.com/nx/API/get_tracking', {
            method: 'post',
            contentType: 'application/x-www-form-urlencoded',
            payload: {
                'number': cleanNumber,
                'token': SCG_TOKEN
            },
            headers: {
                'Referer': 'https://www.scgjwd.com/tracking'
            },
            muteHttpExceptions: true,
            followRedirects: true
        });

        const code = res.getResponseCode();
        const body = res.getContentText();

        if (code !== 200 || !body) {
            return { success: false, error: 'SCG response code: ' + code };
        }

        // Parse JSON response
        let data;
        try {
            data = JSON.parse(body);
        } catch (e) {
            return { success: false, error: 'ไม่สามารถอ่านข้อมูลจาก SCG ได้' };
        }

        // Check if data has results
        if (!data || (Array.isArray(data) && data.length === 0)) {
            return { success: false, error: 'ไม่พบข้อมูลสำหรับหมายเลข: ' + cleanNumber };
        }

        if (data.error || data.status === 'error') {
            return { success: false, error: data.error || data.message || 'SCG API error' };
        }

        // Build clean HTML table from JSON response
        const html = buildScgHtml(data, cleanNumber);
        return { success: true, html: html };

    } catch (e) {
        return { success: false, error: 'เกิดข้อผิดพลาดในการเชื่อมต่อ SCG กรุณาลองใหม่' };
    }
}

/**
 * สร้าง HTML table จาก SCG tracking JSON response
 */
function buildScgHtml(data, trackingNumber) {
    let html = '<style>'
        + 'table{width:100%;border-collapse:collapse;font-size:14px;}'
        + 'th{background:#d32f2f;color:#fff;padding:10px 8px;text-align:left;}'
        + 'td{border:1px solid #ddd;padding:8px;text-align:left;}'
        + 'tr:nth-child(even){background:#f9f9f9;}'
        + '.scg-header{text-align:center;padding:15px 0;}'
        + '.scg-header h3{color:#d32f2f;margin-bottom:5px;}'
        + '.scg-status{display:inline-block;padding:4px 12px;border-radius:12px;font-size:13px;font-weight:600;}'
        + '.status-delivered{background:#e8f5e9;color:#2e7d32;}'
        + '.status-transit{background:#fff3e0;color:#e65100;}'
        + '.status-other{background:#e3f2fd;color:#1565c0;}'
        + '</style>';

    html += '<div class="scg-header">'
        + '<h3>SCG Tracking</h3>'
        + '<p>หมายเลข: <strong>' + escapeHtmlServer(trackingNumber) + '</strong></p>'
        + '</div>';

    // Handle different response structures
    if (typeof data === 'object' && !Array.isArray(data)) {
        // Single object response — render key-value pairs
        if (data.data && Array.isArray(data.data)) {
            html += renderScgTableArray(data.data);
        } else if (data.result && Array.isArray(data.result)) {
            html += renderScgTableArray(data.result);
        } else if (data.tracking && Array.isArray(data.tracking)) {
            html += renderScgTableArray(data.tracking);
        } else {
            // Generic object — render all fields
            html += renderScgObject(data);
        }
    } else if (Array.isArray(data)) {
        html += renderScgTableArray(data);
    } else {
        html += '<p style="text-align:center;padding:20px;">ได้รับข้อมูลแล้ว แต่ไม่สามารถแสดงผลได้</p>';
    }

    return html;
}

/**
 * Render array of tracking events as HTML table
 */
function renderScgTableArray(arr) {
    if (!arr || arr.length === 0) return '<p style="text-align:center;padding:20px;">ไม่พบรายละเอียด</p>';

    // Get all unique keys from all objects
    const keys = [];
    arr.forEach(function (item) {
        if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach(function (k) {
                if (keys.indexOf(k) === -1) keys.push(k);
            });
        }
    });

    if (keys.length === 0) return '<p style="text-align:center;padding:20px;">ไม่พบรายละเอียด</p>';

    let html = '<table><thead><tr>';
    keys.forEach(function (k) {
        html += '<th>' + escapeHtmlServer(k) + '</th>';
    });
    html += '</tr></thead><tbody>';

    arr.forEach(function (item) {
        html += '<tr>';
        keys.forEach(function (k) {
            const val = item[k] !== undefined && item[k] !== null ? String(item[k]) : '-';
            html += '<td>' + escapeHtmlServer(val) + '</td>';
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
}

/**
 * Render a single object as key-value table
 */
function renderScgObject(obj) {
    let html = '<table>';
    Object.keys(obj).forEach(function (key) {
        const val = obj[key];
        if (typeof val === 'object' && val !== null) {
            if (Array.isArray(val) && val.length > 0) {
                html += '<tr><td colspan="2"><strong>' + escapeHtmlServer(key) + '</strong></td></tr>';
                html += '<tr><td colspan="2">' + renderScgTableArray(val) + '</td></tr>';
            }
        } else {
            html += '<tr><td><strong>'
                + escapeHtmlServer(key)
                + '</strong></td><td>'
                + escapeHtmlServer(val !== undefined && val !== null ? String(val) : '-')
                + '</td></tr>';
        }
    });
    html += '</table>';
    return html;
}

/**
 * Server-side HTML escaping
 */
function escapeHtmlServer(str) {
    if (typeof str !== 'string') str = String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
