import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // --- Vercel: บางครั้ง req.body ยังไม่เป็น object ---
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const { member_code, selected } = body;

    if (!member_code || !Array.isArray(selected)) {
      return res.status(400).json({ error: "Missing member_code or selected[]" });
    }

    // --- Env check (กันหลง) ---
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL) return res.status(500).json({ error: "SUPABASE_URL missing" });
    if (!SERVICE_ROLE) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE missing" });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // --- CSV content ---
    const header = ["member_code", "seq", "item_id"];
    const rows = selected.map((x, i) => [
      String(member_code),
      String(x?.seq ?? (i + 1)),
      String(x?.item_id ?? "")
    ]);

    const csv = [header, ...rows]
      .map((r) => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    // --- IMPORTANT: ส่งเป็น Buffer ---
    const bytes = Buffer.from(csv, "utf8");

    // --- path in bucket ---
    const filePath = `recgo/${member_code}.csv`;

    const { error: upErr } = await supabase.storage
      .from("csv") // <-- bucket name ต้องเป็น "csv"
      .upload(filePath, bytes, {
        contentType: "text/csv; charset=utf-8",
        upsert: true
      });

    if (upErr) {
      return res.status(500).json({ error: upErr.message });
    }

    // Signed URL 1 ชั่วโมง
    const { data, error: signErr } = await supabase.storage
      .from("csv")
      .createSignedUrl(filePath, 60 * 60);

    if (signErr) {
      return res.status(500).json({ error: signErr.message });
    }

    return res.status(200).json({
      ok: true,
      saved_to: filePath,
      download_url: data?.signedUrl
    });
  } catch (e) {
    console.error("[/api/save-csv] exception:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}