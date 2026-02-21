import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { member_code, selected } = req.body || {};
    if (!member_code || !Array.isArray(selected)) {
      return res.status(400).json({ error: "Missing data" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL) return res.status(500).json({ error: "SUPABASE_URL is missing" });
    if (!SERVICE_ROLE) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY is missing" });

    // server-only client (service role)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // ---- CSV ----
    const header = ["member_code", "seq", "item_id"];
    const rows = selected.map((x) => [member_code, x.seq, x.item_id]);

    // ใส่ \r\n กัน Excel งอแง
    const csv = [header, ...rows].map((r) => r.join(",")).join("\r\n");

    const filePath = `recgo/${member_code}.csv`;
    const csvBuffer = Buffer.from(csv, "utf8");

    const { error: upErr } = await supabase.storage
      .from("csv") // bucket name
      .upload(filePath, csvBuffer, {
        upsert: true,
        contentType: "text/csv; charset=utf-8",
        cacheControl: "3600",
      });

    if (upErr) return res.status(500).json({ error: upErr.message });

    const { data, error: signErr } = await supabase.storage
      .from("csv")
      .createSignedUrl(filePath, 60 * 60);

    if (signErr) return res.status(500).json({ error: signErr.message });

    return res.json({ ok: true, saved_to: filePath, download_url: data?.signedUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}