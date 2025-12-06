"use client"

import { ReceiverContextSidebar } from "@/components/responder/ReceiverContextSidebar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Clock, MoreVertical, AlertTriangle, X } from "lucide-react"
import { useResponderStore } from "@/lib/store"
import { MOCK_ACTIVE_CHATS } from "@/lib/mockData"

export function ChatInterface() {
    const { selectedChatId, setSelectedChatId } = useResponderStore()

    const activeChat = MOCK_ACTIVE_CHATS.find(c => c.id === selectedChatId)

    const displayChat = activeChat || {
        id: selectedChatId,
        user_alias: "Unknown User",
        type: "crisis",
        mood_emoji: "❓",
        message_history: []
    }

    if (!selectedChatId) return null

    return (
        <div className="flex h-full">
            {/* Center: Chat History & Input */}
            <div className="flex-1 flex flex-col h-full bg-white">
                {/* Chat Header */}
                <div className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${displayChat.type === 'crisis' ? 'bg-red-100' : 'bg-blue-100'}`}>
                            {displayChat.mood_emoji || "👤"}
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-900">{displayChat.user_alias}</h2>
                            {displayChat.type === 'crisis' && (
                                <div className="flex items-center gap-1.5 text-red-600 text-xs font-semibold animate-pulse">
                                    <AlertTriangle className="h-3 w-3" />
                                    CRISIS SESSION
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="bg-gray-100 px-3 py-1 rounded-full text-sm font-mono flex items-center gap-2 text-gray-600">
                            <Clock className="h-4 w-4" />
                            <span>12m</span> {/* Changed to duration format */}
                        </div>
                        <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50">Escalate</Button>
                        <Button
                            variant="destructive"
                            onClick={() => setSelectedChatId(null)}
                        >
                            End Session
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-6 bg-slate-50">
                    <div className="space-y-6 max-w-3xl mx-auto">
                        {displayChat.message_history?.map((msg, idx) => (
                            <div key={idx} className={`flex gap-4 ${msg.sender === 'responder' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex-shrink-0 ${msg.sender === 'responder' ? 'bg-blue-100' : 'bg-gray-200'}`} />
                                <div className={`space-y-1 ${msg.sender === 'responder' ? 'text-right' : ''}`}>
                                    <div className={`flex items-center gap-2 ${msg.sender === 'responder' ? 'justify-end' : ''}`}>
                                        <span className="text-sm font-semibold text-gray-700">
                                            {msg.sender === 'responder' ? 'You' : displayChat.user_alias}
                                        </span>
                                        <span className="text-xs text-gray-400">{msg.time}</span>
                                    </div>
                                    <div className={`
                                        p-4 shadow-sm text-left
                                        ${msg.sender === 'responder'
                                            ? 'bg-blue-600 text-white rounded-l-2xl rounded-br-2xl'
                                            : 'bg-white border border-gray-200 text-gray-800 rounded-r-2xl rounded-bl-2xl'
                                        }
                                        ${msg.sender === 'receiver' && displayChat.type === 'crisis' ? 'border-l-4 border-l-red-500' : ''}
                                    `}>
                                        {msg.text}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 border-t bg-white">
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-none">
                        {["Are you safe?", "I'm here for you", "Crisis Resources"].map(t => (
                            <button key={t} className="flex-shrink-0 text-xs bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-transparent hover:border-blue-200 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap text-gray-700">
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2 max-w-4xl mx-auto">
                        <Textarea
                            placeholder="Type your message... (Shift+Enter for new line)"
                            className="min-h-[50px] resize-none border-gray-300 focus:border-blue-500 focus:ring-blue-100 text-gray-900 placeholder:text-gray-400"
                        />
                        <Button size="icon" className="h-[50px] w-[50px] bg-blue-600 hover:bg-blue-700 shrink-0">
                            <Send className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Right: Context Sidebar */}
            <ReceiverContextSidebar activeChatId={selectedChatId} />
        </div>
    )
}
