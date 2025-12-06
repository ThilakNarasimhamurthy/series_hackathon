"use client"

import { MOCK_ACTIVE_CHATS } from "@/lib/mockData"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useResponderStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export function ActiveChatsPanel() {
    const { selectedChatId, setSelectedChatId } = useResponderStore()

    return (
        <div className="flex flex-col h-1/2">
            <div className="p-4 border-b bg-gray-50">
                <h2 className="font-bold text-gray-700">Active Chats</h2>
            </div>

            <ScrollArea className="flex-1">
                <div className="divide-y">
                    {MOCK_ACTIVE_CHATS.map((chat) => (
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
                                    <span className="font-semibold text-gray-900">{chat.user_alias}</span>
                                    {chat.unread_count > 0 && (
                                        <Badge className="h-5 w-5 rounded-full p-0 flex items-center justify-center bg-blue-600 text-[10px]">
                                            {chat.unread_count}
                                        </Badge>
                                    )}
                                </div>
                                <span className="text-xs text-gray-400">{chat.timestamp}</span>
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
                                <span className="mr-1">{chat.mood_emoji}</span>
                                {chat.last_message}
                            </p>
                        </div>
                    ))}

                    {MOCK_ACTIVE_CHATS.length === 0 && (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            No active chats. Go available to receive matches.
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}
