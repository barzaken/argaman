import { z } from "zod";

// הודעות ולידציה מובנות של zod בעברית (במקום "Invalid UUID" / "Too small" באנגלית)
z.config(z.locales.he());

export { z };
