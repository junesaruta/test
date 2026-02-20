import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { member_code, selected } = req.body || {};

  if (!member_code || !Array.isArray(selected)) {
    return res.status(400).json({ error: "Missing data" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE
  );

  // ----- create CSV -----
  const header = ["member_code","seq","item_id"];
  const rows = selected.map(x => [member_code, x.seq, x.item_id]);

  const csv = [header, ...rows]
    .map(r => r.join(","))
    .join("\n");

  const filePath = `recgo/${member_code}.csv`;

  const { error } = await supabase.storage
    .from("csv")
    .upload(filePath, csv, {
      contentType: "text/csv",
      upsert: true
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const { data } = await supabase.storage
    .from("csv")
    .createSignedUrl(filePath, 60 * 60);

  res.json({
    ok: true,
    saved_to: filePath,
    download_url: data?.signedUrl
  });
}