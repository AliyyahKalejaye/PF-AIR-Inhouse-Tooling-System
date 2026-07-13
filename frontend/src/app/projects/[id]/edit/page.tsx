// Server Component shell for the dynamic [id]/edit segment — same
// static-export constraint as ../page.tsx (see that file's comment for
// the full explanation). Actual logic lives in EditProjectClient.tsx.
import { EditProjectClient } from "./EditProjectClient";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export const dynamicParams = false;

export default function EditProjectPage() {
  return <EditProjectClient />;
}
