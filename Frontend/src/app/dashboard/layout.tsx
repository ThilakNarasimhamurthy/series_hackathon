import { ResponderHeader } from "@/components/responder/ResponderHeader"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-gray-50">
            <ResponderHeader />
            <main className="h-[calc(100vh-65px)] overflow-hidden">
                {children}
            </main>
        </div>
    )
}
