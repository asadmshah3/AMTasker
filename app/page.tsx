import { AppShell } from "@/components/app-shell"
import { ProfileGate } from "@/components/profiles"

export default function Page() {
  return (
    <ProfileGate>
      <AppShell />
    </ProfileGate>
  )
}
