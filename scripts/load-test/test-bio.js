const fs = require('fs');
const path = require('path');

// =========================================================================
// THAY ĐỔI ĐƯỜNG DẪN FILE PDF CỦA BẠN VÀO BIẾN NÀY (Hỗ trợ đường dẫn tương đối hoặc tuyệt đối)
// =========================================================================
const PDF_FILE_PATH = './../../data/sample-pdf/sample-pdf.pdf';
// =========================================================================

async function runTest() {
  console.log(`\n[1] Đang kiểm tra file: ${PDF_FILE_PATH}`);

  const absolutePath = path.resolve(__dirname, PDF_FILE_PATH);
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ LỖI: Không tìm thấy file tại đường dẫn: ${absolutePath}`);
    console.error(`Hãy sửa lại biến PDF_FILE_PATH trong file script này nhé!`);
    return;
  }

  try {
    console.log('[2] Đang đăng nhập (Organizer) để lấy token...');
    const loginRes = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'organizer@ticketbox.dev', password: 'password123' })
    });

    if (!loginRes.ok) throw new Error(`Đăng nhập thất bại: ${await loginRes.text()}`);
    const { access_token } = await loginRes.json();

    console.log('[3] Đang tìm một Concert ID để test...');
    const concertsRes = await fetch('http://localhost:3000/concerts');
    if (!concertsRes.ok) throw new Error(`Lỗi lấy concert: ${await concertsRes.text()}`);
    const concerts = await concertsRes.json();

    if (concerts.length === 0) {
      console.error('❌ LỖI: Không có concert nào trong database.');
      return;
    }
    const concertId = concerts[0].id;
    console.log(`    -> Sẽ upload vào Concert: ${concerts[0].title} (ID: ${concertId})`);

    console.log('[4] Đang gửi file PDF lên server cho Gemini xử lý (vui lòng chờ vài giây)...');

    // Đọc file và đóng gói vào FormData
    const fileBuffer = fs.readFileSync(absolutePath);
    const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('pdf', fileBlob, path.basename(absolutePath));

    // Gọi API
    const bioRes = await fetch(`http://localhost:3000/concerts/${concertId}/bio`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`
      },
      body: formData
    });

    const result = await bioRes.json();

    if (bioRes.ok) {
      console.log('\n================== 🌟 KẾT QUẢ TỪ GEMINI ==================');
      console.log(result.bio);
      console.log('==========================================================\n');
    } else {
      console.error('\n❌ API TRẢ VỀ LỖI CỤ THỂ TỪ SERVER:');
      console.error(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('\n❌ CÓ LỖI XẢY RA TRONG QUÁ TRÌNH CHẠY SCRIPT:', error.message);
  }
}

runTest();
