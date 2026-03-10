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
