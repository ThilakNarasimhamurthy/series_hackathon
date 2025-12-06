"use client"

import { useResponderStore } from "@/lib/store"
import { MOCK_ACTIVE_CHATS } from "@/lib/mockData"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Inbox, Zap, MessageSquare, Clock, ChevronRight, AlertCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useState } from "react"

export function UnifiedSidebar() {
    const alerts = useResponderStore((state) => state.alerts)
    const removeAlert = useResponderStore((state) => state.removeAlert)
    const { selectedChatId, setSelectedChatId } = useResponderStore()
    const [activeTab, setActiveTab] = useState<"all" | "crisis" | "active">("all")

    // Merge active chats with store state if we had real backend, 
    // for now we use mock + store alerts

    return (
        <div className="flex flex-col h-full bg-white border-r border-gray-200">
            {/* Header / Filter */}
            <div className="p-4 border-b border-gray-100 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-lg text-gray-800 tracking-tight flex items-center gap-2">
                        <Inbox className="w-5 h-5 text-gray-500" />
                        Caseload
                    </h2>
                    <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                        {alerts.length + MOCK_ACTIVE_CHATS.length} Total
                    </Badge>
                </div>

                <div className="flex gap-1 p-1 bg-gray-50 rounded-lg">
                    {["all", "crisis", "active"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={cn(
                                "flex-1 text-xs font-medium py-1.5 rounded-md transition-all capitalize",
                                activeTab === tab
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-3 space-y-6">

                    {/* INCOMING TRIAGE (Crisis) */}
                    {(activeTab === "all" || activeTab === "crisis") && alerts.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-red-900 uppercase tracking-wider px-2 flex items-center justify-between">
                                <span>Incoming Triage</span>
                                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            </h3>

                            <AnimatePresence mode="popLayout">
                                {alerts.map(alert => (
                                    <motion.div
                                        key={alert.id}
                                        layout
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                    >
                                        <div className="group relative bg-white border border-red-100 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-red-200 transition-all cursor-pointer">
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-xl" />

                                            <div className="flex justify-between items-start mb-2 pl-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900">{alert.user_alias}</span>
                                                    <Badge className="bg-red-50 text-red-700 border-red-100 text-[10px] px-1.5 hover:bg-red-100">
                                                        {alert.severity}
                                                    </Badge>
                                                </div>
                                                <span className="text-[10px] text-gray-400 font-mono">{alert.timestamp}</span>
                                            </div>

                                            <p className="text-sm text-gray-600 line-clamp-2 pl-2 mb-3 leading-relaxed">
                                                <span className="text-red-400 mr-1">Detected:</span>
                                                {alert.message_preview.replace(/<[^>]*>/g, '')}
                                            </p>

                                            <div className="pl-2">
                                                <Button
                                                    size="sm"
                                                    className="w-full bg-gray-900 text-white hover:bg-gray-800 h-8 text-xs font-medium"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        removeAlert(alert.id)
                                                        // logic to add to active chats would go here
                                                    }}
                                                >
                                                    Accept Case
                                                </Button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* SEPARATOR */}
                    {(activeTab === "all" && alerts.length > 0) && <Separator />}

                    {/* ACTIVE CASELOAD */}
                    {(activeTab === "all" || activeTab === "active") && (
                        <div className="space-y-2">
                            {activeTab === "all" && (
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">
                                    Active Sessions
                                </h3>
                            )}

                            {MOCK_ACTIVE_CHATS.map(chat => (
                                <div
                                    key={chat.id}
                                    onClick={() => setSelectedChatId(chat.id)}
                                    className={cn(
                                        "group flex flex-col p-3 rounded-xl transition-all border cursor-pointer",
                                        selectedChatId === chat.id
                                            ? "bg-blue-50/50 border-blue-200 shadow-sm"
                                            : "bg-transparent border-transparent hover:bg-gray-50"
                                    )}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "font-semibold text-sm",
                                                selectedChatId === chat.id ? "text-blue-900" : "text-gray-700"
                                            )}>
                                                {chat.user_alias}
                                            </span>
                                            {chat.type === 'crisis' && <AlertCircle className="w-3 h-3 text-red-500" />}
                                        </div>
                                        <span className="text-[10px] text-gray-400">{chat.timestamp}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-gray-500 truncate max-w-[180px]">
                                            {chat.mood_emoji} {chat.last_message}
                                        </p>
                                        {chat.unread_count > 0 && (
                                            <Badge className="h-5 min-w-5 rounded-full px-1.5 flex items-center justify-center bg-blue-600 text-[10px]">
                                                {chat.unread_count}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}
