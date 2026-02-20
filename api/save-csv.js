const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  // CORS (เผื่อเรียกจากหน้าเว็บ)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // บางที body อาจเป็น string
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { member_code, selected } = body;

    if (!member_code || !Array.isArray(selected)) {
      return res.status(400).json({ error: "Missing member_code or selected[]" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL) return res.status(500).json({ error: "Missing env SUPABASE_URL" });
    if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: "Missing env SUPABASE_SERVICE_ROLE_KEY" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ---- Build CSV ----
    const header = ["member_code", "seq", "item_id"];
    const rows = selected.map((x) => [member_code, x.seq, x.item_id]);

    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const bucket = "csv"; // ต้องมี bucket นี้ใน Storage
    const filePath = `recgo/${member_code}.csv`;

    // ✅ อัปโหลดเป็น Buffer (ชัวร์สุดบน Node)
    const fileBody = Buffer.from(csv, "utf8");

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBody, {
        contentType: "text/csv; charset=utf-8",
        upsert: true,
      });

    if (upErr) return res.status(500).json({ error: upErr.message });

    // ถ้า bucket เป็น private → สร้าง signed url
    const { data, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 60 * 60);

    if (signErr) {
      // ถ้า sign ไม่ได้ ก็ยังตอบว่าบันทึกสำเร็จ
      return res.json({ ok: true, saved_to: `${bucket}/${filePath}` });
    }

    return res.json({
      ok: true,
      saved_to: `${bucket}/${filePath}`,
      download_url: data?.signedUrl,
    });
  } catch (e) {
    console.error("[save-csv] exception:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
};