"use client"

import { UnifiedSidebar } from "@/components/responder/UnifiedSidebar"
import { ChatInterface } from "@/components/responder/ChatInterface"
import { useResponderStore } from "@/lib/store"

export default function DashboardPage() {
    const { selectedChatId } = useResponderStore()

    return (
        <div className="grid grid-cols-12 h-full min-h-0">
            {/* Left Panel: Unified Caseload (Width slightly optimized) */}
            <div className="col-span-4 md:col-span-3 border-r bg-white h-full overflow-hidden">
                <UnifiedSidebar />
            </div>

            {/* Main Panel: Chat Interface or Empty State */}
            <div className="col-span-8 md:col-span-9 h-full min-h-0 bg-slate-50 overflow-hidden">
                {selectedChatId ? (
                    <ChatInterface />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center grayscale opacity-50">
                            <span className="text-3xl">☕️</span>
                        </div>
                        <p className="text-lg font-medium text-gray-400">Ready for triage.</p>
                        <p className="text-sm text-gray-400">Select a case from the sidebar.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
