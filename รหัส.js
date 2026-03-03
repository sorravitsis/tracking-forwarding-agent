function doGet(e) {
  // ===== API mode: เรียกจากเว็บภายนอก (GitHub Pages) =====
  if (e && e.parameter && e.parameter.action === 'porlor') {
    var result = getPorlorTracking(e.parameter.tracking || '');
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
 * ดึงข้อมูล tracking จาก Porlor (RFE) ผ่าน server-side
 * แก้ไข link ลายเซ็นให้ถูกต้อง + ตัด content ที่ไม่จำเป็นออก
 */
function getPorlorTracking(trackingNumber) {
  try {
    var res = UrlFetchApp.fetch('https://rfe.co.th/hc_rfeweb/trackingweb/search', {
      method: 'post',
      payload: {
        'awb': '',
        'trackID': trackingNumber,
        'page_no': '1',
        'per_page': '10'
      },
      muteHttpExceptions: true,
      followRedirects: true
    });

    var code = res.getResponseCode();
    var html = res.getContentText();

    if (code !== 200 || !html || html.length < 10) {
      return { success: false, error: 'Porlor response code: ' + code };
    }

    // ตัด content ที่ไม่จำเป็นออกเพื่อลดขนาด
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
    html = html.replace(/<link[^>]*>/gi, '');
    html = html.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    html = html.replace(/<header[\s\S]*?<\/header>/gi, '');
    html = html.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    html = html.replace(/\s+onload="[^"]*"/gi, '');
    html = html.replace(/\s+onerror="[^"]*"/gi, '');

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

    // เฉพาะ body content + inline style (ไม่ครอบ html/head/body เพราะจะแสดงใน modal)
    html = '<style>table{width:100%;border-collapse:collapse;}td,th{border:1px solid #ddd;padding:8px;text-align:left;}a{color:#d32f2f;}</style>'
      + html;

    return { success: true, html: html };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

