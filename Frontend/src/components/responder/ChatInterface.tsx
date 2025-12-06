"use client"

import { ReceiverContextSidebar } from "@/components/responder/ReceiverContextSidebar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Clock, AlertTriangle, X, Loader2 } from "lucide-react"
import { useResponderStore } from "@/lib/store"
import { apiClient } from "@/lib/api"
import { useState, useEffect, useRef } from "react"

interface Message {
    id: string
    text: string
    sent_at: string
    sender: 'responder' | 'receiver'
    from_phone?: string
    is_read?: boolean
}

interface Chat {
    id: string
    user_display_name: string
    type: string
    status: string
    series_chat_id?: string
    messages?: Message[]
    created_at: string
}

export function ChatInterface() {
    const { selectedChatId, setSelectedChatId } = useResponderStore()
    const [chat, setChat] = useState<Chat | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [messageText, setMessageText] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollViewportRef = useRef<HTMLDivElement>(null)

    // Function to scroll to bottom
    const scrollToBottom = () => {
        if (scrollViewportRef.current) {
            scrollViewportRef.current.scrollTo({
                top: scrollViewportRef.current.scrollHeight,
                behavior: 'smooth'
            })
        } else {
            // Fallback to scrollIntoView
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 50)
        }
    }

    // Fetch chat data when selectedChatId changes
    useEffect(() => {
        if (!selectedChatId) {
            setChat(null)
            setMessages([])
            return
        }

        async function fetchChat() {
            setIsLoading(true)
            setError(null)
            try {
                const chatData = await apiClient.getChatWithMessages(selectedChatId)
                setChat(chatData)
                setMessages(chatData.messages || [])
                // Scroll to bottom when messages load - use longer timeout to ensure DOM is updated
                setTimeout(() => {
                    scrollToBottom()
                }, 200)
            } catch (err: any) {
                // Handle rate limit errors gracefully - don't show error to user, just log
                if (err.message?.includes('Too many requests') || err.message?.includes('429')) {
                    console.warn('Rate limit reached, will retry on next interval')
                    // Don't set error state for rate limits, just silently retry
                } else {
                    console.error('Error fetching chat:', err)
                    setError(err.message || 'Failed to load chat')
                }
            } finally {
                setIsLoading(false)
            }
        }

        fetchChat()

        // Refresh messages every 20 seconds (reduced frequency to avoid rate limits)
        const interval = setInterval(fetchChat, 20000)
        return () => clearInterval(interval)
    }, [selectedChatId])

    // Auto-scroll when messages change
    useEffect(() => {
        if (messages.length > 0 && scrollViewportRef.current) {
            // Small delay to ensure DOM is updated
            const timeoutId = setTimeout(() => {
                scrollToBottom()
            }, 150)
            return () => clearTimeout(timeoutId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages.length])

    const handleSendMessage = async () => {
        if (!messageText.trim() || !selectedChatId || isSending) return

        setIsSending(true)
        try {
            const response = await apiClient.sendChatMessage(selectedChatId, messageText.trim())
            
            // Add sent message to local state
            const newMessage: Message = {
                id: response.message.id,
                text: response.message.text,
                sent_at: response.message.sent_at,
                sender: 'responder'
            }
            setMessages(prev => [...prev, newMessage])
            setMessageText("")
            
            // Scroll to bottom after message is added
            setTimeout(() => {
                scrollToBottom()
            }, 200)
        } catch (err: any) {
            console.error('Error sending message:', err)
            setError(err.message || 'Failed to send message')
        } finally {
            setIsSending(false)
        }
    }

    const handleEndSession = async () => {
        if (!selectedChatId) return
        
        try {
            await apiClient.updateChatStatus(selectedChatId, 'ended')
            setSelectedChatId(null)
        } catch (err: any) {
            console.error('Error ending session:', err)
            setError(err.message || 'Failed to end session')
        }
    }

    const formatTime = (timestamp: string) => {
        try {
            const date = new Date(timestamp)
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        } catch {
            return timestamp
        }
    }

    const formatDuration = (createdAt: string) => {
        try {
            const start = new Date(createdAt)
            const now = new Date()
            const diffMs = now.getTime() - start.getTime()
            const diffMins = Math.floor(diffMs / 60000)
            
            if (diffMins < 1) return 'now'
            if (diffMins < 60) return `${diffMins}m`
            const diffHours = Math.floor(diffMins / 60)
            if (diffHours < 24) return `${diffHours}h`
            const diffDays = Math.floor(diffHours / 24)
            return `${diffDays}d`
        } catch {
            return '--'
        }
    }

    if (!selectedChatId) return null

    if (isLoading && !chat) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (error && !chat) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-red-600">
                <p className="text-sm">{error}</p>
                <Button onClick={() => setSelectedChatId(null)} variant="outline" className="mt-4">
                    Go Back
                </Button>
            </div>
        )
    }

    const displayChat = chat || {
        id: selectedChatId,
        user_display_name: "Unknown User",
        type: "general",
        status: "active",
        created_at: new Date().toISOString()
    }

    return (
        <div className="flex h-full">
            {/* Center: Chat History & Input */}
            <div className="flex-1 flex flex-col h-full bg-white">
                {/* Chat Header */}
                <div className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm z-10">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${displayChat.type === 'crisis' ? 'bg-red-100' : 'bg-blue-100'}`}>
                            {displayChat.type === 'crisis' ? '🚨' : '👤'}
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-900">{displayChat.user_display_name}</h2>
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
                            <span>{formatDuration(displayChat.created_at)}</span>
                        </div>
                        <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50">Escalate</Button>
                        <Button
                            variant="destructive"
                            onClick={handleEndSession}
                        >
                            End Session
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50" ref={scrollViewportRef}>
                    <div className="space-y-6 max-w-3xl mx-auto">
                        {messages.length === 0 ? (
                            <div className="text-center text-gray-400 py-8">
                                <p>No messages yet. Start the conversation!</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div key={msg.id} className={`flex gap-4 ${msg.sender === 'responder' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex-shrink-0 ${msg.sender === 'responder' ? 'bg-blue-100' : 'bg-gray-200'}`} />
                                <div className={`space-y-1 ${msg.sender === 'responder' ? 'text-right' : ''}`}>
                                    <div className={`flex items-center gap-2 ${msg.sender === 'responder' ? 'justify-end' : ''}`}>
                                        <span className="text-sm font-semibold text-gray-700">
                                                {msg.sender === 'responder' ? 'You' : displayChat.user_display_name}
                                        </span>
                                            <span className="text-xs text-gray-400">{formatTime(msg.sent_at)}</span>
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
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area */}
                <div className="p-4 border-t bg-white">
                    {error && (
                        <div className="mb-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                            {error}
                        </div>
                    )}
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-none">
                        {["Are you safe?", "I'm here for you", "Crisis Resources"].map(t => (
                            <button 
                                key={t} 
                                onClick={() => setMessageText(t)}
                                className="flex-shrink-0 text-xs bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-transparent hover:border-blue-200 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap text-gray-700"
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2 max-w-4xl mx-auto">
                        <Textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSendMessage()
                                }
                            }}
                            placeholder="Type your message... (Shift+Enter for new line)"
                            className="min-h-[50px] resize-none border-gray-300 focus:border-blue-500 focus:ring-blue-100 text-gray-900 placeholder:text-gray-400"
                            disabled={isSending}
                        />
                        <Button 
                            size="icon" 
                            className="h-[50px] w-[50px] bg-blue-600 hover:bg-blue-700 shrink-0"
                            onClick={handleSendMessage}
                            disabled={!messageText.trim() || isSending}
                        >
                            {isSending ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                            <Send className="h-5 w-5" />
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Right: Context Sidebar */}
            <ReceiverContextSidebar activeChatId={selectedChatId} />
        </div>
    )
}
