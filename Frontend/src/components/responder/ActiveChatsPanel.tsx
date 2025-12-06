"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useResponderStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { apiClient } from "@/lib/api"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

export function ActiveChatsPanel() {
    const { selectedChatId, setSelectedChatId } = useResponderStore()
    const [chats, setChats] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function fetchChats() {
            setIsLoading(true)
            try {
                // Use default responder ID for now
                const responderId = 'default-responder'
                const chatsData = await apiClient.getResponderChats(responderId)
                setChats(chatsData || [])
            } catch (err) {
                console.error('Error fetching chats:', err)
            } finally {
                setIsLoading(false)
            }
        }

        fetchChats()
        const interval = setInterval(fetchChats, 30000) // Refresh every 30 seconds
        return () => clearInterval(interval)
    }, [])

    const formatTimestamp = (timestamp: string) => {
        try {
            const date = new Date(timestamp)
            const now = new Date()
            const diffMs = now.getTime() - date.getTime()
            const diffMins = Math.floor(diffMs / 60000)
            
            if (diffMins < 1) return 'now'
            if (diffMins < 60) return `${diffMins}m`
            const diffHours = Math.floor(diffMins / 60)
            if (diffHours < 24) return `${diffHours}h`
            const diffDays = Math.floor(diffHours / 24)
            return `${diffDays}d`
        } catch {
            return timestamp
        }
    }

    return (
        <div className="flex flex-col h-1/2">
            <div className="p-4 border-b bg-gray-50">
                <h2 className="font-bold text-gray-700">Active Chats</h2>
            </div>

            <ScrollArea className="flex-1">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                ) : (
                <div className="divide-y">
                        {chats.map((chat) => (
                        <div
                            key={chat.id}
                            onClick={() => setSelectedChatId(chat.id)}
                            className={cn(
                                "p-4 cursor-pointer hover:bg-gray-50 transition-colors",
                                selectedChatId === chat.id ? "bg-blue-50 border-l-4 border-l-blue-500" : "border-l-4 border-l-transparent"
                            )}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                        <span className="font-semibold text-gray-900">{chat.user_display_name || 'Anonymous'}</span>
                                    {chat.unread_count > 0 && (
                                        <Badge className="h-5 w-5 rounded-full p-0 flex items-center justify-center bg-blue-600 text-[10px]">
                                            {chat.unread_count}
                                        </Badge>
                                    )}
                                </div>
                                    <span className="text-xs text-gray-400">{formatTimestamp(chat.last_message_at || chat.created_at)}</span>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                                {chat.type === "crisis" && (
                                    <Badge variant="destructive" className="text-[10px] px-1 py-0 h-5">Crisis</Badge>
                                )}
                                {chat.type === "peer" && (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5 bg-blue-100 text-blue-700 hover:bg-blue-200">Peer</Badge>
                                )}
                            </div>

                            <p className="text-sm text-gray-600 truncate">
                                    {chat.last_message || 'No messages yet'}
                            </p>
                        </div>
                    ))}

                        {chats.length === 0 && (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            No active chats. Go available to receive matches.
                        </div>
                    )}
                </div>
                )}
            </ScrollArea>
        </div>
    )
}
