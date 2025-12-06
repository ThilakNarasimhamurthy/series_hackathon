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
    sender: 'responder' | 'receiver' | 'user' | 'ai_agent' | 'system'
    sender_label?: string
    source?: 'user' | 'ai_agent' | 'responder'
    from_phone?: string
    is_read?: boolean
    type?: 'message' | 'system' | 'ai_transition'
}

interface Chat {
    id: string
    user_display_name: string
    type: string
    status: string
    series_chat_id?: string
    messages?: Message[]
    created_at: string
    responder_id?: string | null
    responder_name?: string | null
    ended_at?: string | null
}

export function ChatInterface() {
    const { selectedChatId, setSelectedChatId } = useResponderStore()
    const [chat, setChat] = useState<Chat | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [messageText, setMessageText] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [isEnding, setIsEnding] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollViewportRef = useRef<HTMLDivElement>(null)
    const skipRefreshRef = useRef(false)

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
            setError(null)
            return
        }

        // Clear old chat data immediately when switching chats
        setChat(null)
        setMessages([])
        setError(null)
        setIsLoading(true)

        async function fetchChat() {
            try {
                const chatData = await apiClient.getChatWithMessages(selectedChatId)
                console.log('📥 Fetched chat data:', {
                    chatId: chatData?.id,
                    hasMessages: !!chatData?.messages,
                    messageCount: chatData?.messages?.length || 0,
                    messages: chatData?.messages
                })
                
                // Only update state if we got valid data
                if (chatData && chatData.id) {
                    setChat(chatData)
                    const messagesArray = Array.isArray(chatData.messages) ? chatData.messages : []
                    console.log('💬 Setting messages:', messagesArray.length, messagesArray)
                    
                    // Add system messages for responder entry/exit
                    const enrichedMessages = addSystemMessages(messagesArray, chatData)
                    setMessages(enrichedMessages)
                    setError(null) // Clear any previous errors
                    
                    // Scroll to bottom when messages load - use longer timeout to ensure DOM is updated
                    setTimeout(() => {
                        scrollToBottom()
                    }, 200)
                } else {
                    console.warn('⚠️  Invalid chat data received:', chatData)
                    // Don't clear existing chat if we have one, just show error
                    if (!chat) {
                        setError('Invalid chat data received')
                    }
                }
            } catch (err: any) {
                console.error('❌ Error fetching chat:', err)
                
                // Handle connection errors specifically
                const isConnectionError = err.message?.includes('Cannot connect to backend') || 
                                        err.message?.includes('Failed to fetch') ||
                                        err.message?.includes('NetworkError')
                
                // Handle rate limit errors gracefully - don't show error to user, just log
                if (err.message?.includes('Too many requests') || err.status === 429) {
                    console.warn('Rate limit reached, will retry on next interval')
                    // Don't set error state for rate limits, just silently retry
                    // Keep existing chat/messages if available
                    // Set skip refresh flag to pause auto-refresh
                    skipRefreshRef.current = true
                    setTimeout(() => {
                        skipRefreshRef.current = false
                    }, 120000) // 2 minutes
                } else if (isConnectionError) {
                    // Connection errors - show helpful message but don't clear existing data
                    if (!chat) {
                        setError('Unable to connect to server. Please ensure the backend is running on port 3001.')
                    } else {
                        // If we have existing data, just log the error but don't break the UI
                        console.warn('Connection error refreshing chat, keeping existing data:', err.message)
                        // Don't set error state - keep showing existing chat
                    }
                } else {
                    // Other errors - only set error if we don't have existing chat data
                    if (!chat) {
                        setError(err.message || 'Failed to load chat')
                        // Clear state only if we don't have existing data
                        setChat(null)
                        setMessages([])
                    } else {
                        // If we have existing data, just log the error but don't break the UI
                        console.warn('Error refreshing chat, keeping existing data:', err.message)
                    }
                }
            } finally {
                setIsLoading(false)
            }
        }

        fetchChat()

        // Refresh messages every 30 seconds (increased to avoid rate limits)
        const interval = setInterval(() => {
            if (!skipRefreshRef.current) {
                fetchChat().catch((err) => {
                    // If rate limited, skip next few refreshes
                    if (err.message?.includes('Too many requests') || err.status === 429) {
                        skipRefreshRef.current = true
                        console.warn('Rate limited - pausing auto-refresh for 2 minutes')
                        // Re-enable after 2 minutes
                        setTimeout(() => {
                            skipRefreshRef.current = false
                            console.log('Auto-refresh re-enabled')
                        }, 120000)
                    }
                })
            }
        }, 30000)
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

        // Check if session is ended - responder cannot send messages after session ends
        if (chat && (chat.status === 'ended' || chat.status === 'archived')) {
            setError('Session ended. The AI agent is now handling this conversation.')
            return
        }

        setIsSending(true)
        setError(null) // Clear previous errors
        
        try {
            const response = await apiClient.sendChatMessage(selectedChatId, messageText.trim())
            
            // Add sent message to local state
            const newMessage: Message = {
                id: response.message.id?.toString() || `msg-${Date.now()}`,
                text: response.message.text,
                sent_at: response.message.sent_at,
                sender: 'responder'
            }
            
            // Refresh chat data to get updated messages with system logs
            try {
                const updatedChat = await apiClient.getChatWithMessages(selectedChatId)
                if (updatedChat && updatedChat.messages) {
                    const enrichedMessages = addSystemMessages(updatedChat.messages, updatedChat)
                    setMessages(enrichedMessages)
                    if (updatedChat) {
                        setChat(updatedChat)
                    }
                } else {
                    // Fallback: just add the new message
                    setMessages(prev => [...prev, newMessage])
                }
            } catch (refreshError) {
                console.warn('Could not refresh messages, using local update:', refreshError)
                setMessages(prev => [...prev, newMessage])
            }
            
            setMessageText("")
            
            // Scroll to bottom after message is added
            setTimeout(() => {
                scrollToBottom()
            }, 200)
        } catch (err: any) {
            console.error('Error sending message:', err)
            // Handle session ended error
            if (err.message?.includes('Session ended') || err.status === 403) {
                setError('Session ended. The AI agent is now handling this conversation.')
                // Update chat status in local state
                if (chat) {
                    setChat({ ...chat, status: 'ended' })
                }
            } else if (err.message?.includes('Too many requests') || err.status === 429) {
                const retryAfter = (err as any).retryAfter || 60
                setError(`Too many requests. Please wait ${retryAfter} seconds before sending another message.`)
            } else {
                setError(err.message || 'Failed to send message')
            }
        } finally {
            setIsSending(false)
        }
    }

    const handleEndSession = async () => {
        if (!selectedChatId || isEnding) return
        
        // Prevent ending if already ended
        if (chat?.status === 'ended' || chat?.status === 'archived') {
            setError('This session has already been ended.')
            return
        }
        
        setIsEnding(true)
        setError(null)
        
        try {
            const response = await apiClient.updateChatStatus(selectedChatId, 'ended')
            console.log('✅ Session ended successfully:', response)
            
            // Update chat status in local state
            if (chat) {
                setChat({ ...chat, status: 'ended' })
            }
            
            // Refresh chat data to get updated status and messages with system logs
            try {
                const updatedChat = await apiClient.getChatWithMessages(selectedChatId)
                if (updatedChat) {
                    setChat(updatedChat)
                    // Refresh messages with system logs
                    if (updatedChat.messages) {
                        const enrichedMessages = addSystemMessages(updatedChat.messages, updatedChat)
                        setMessages(enrichedMessages)
                    }
                }
            } catch (refreshError) {
                console.warn('Could not refresh chat after ending session:', refreshError)
                // Don't fail if refresh fails - we already updated local state
            }
            
            // Don't close the chat view - show that session is ended
            // setSelectedChatId(null)
        } catch (err: any) {
            console.error('❌ Error ending session:', err)
            
            // Handle specific error cases
            if (err.message?.includes('Too many requests') || err.status === 429) {
                const retryAfter = (err as any).retryAfter || 60
                setError(`Too many requests. Please wait ${retryAfter} seconds before ending another session.`)
            } else if (err.message?.includes('Chat not found')) {
                setError('Chat not found. It may have been deleted or archived.')
                // Optionally close the chat view
                // setSelectedChatId(null)
            } else if (err.message?.includes('Invalid status')) {
                setError(err.message)
            } else if (err.message?.includes('Server error')) {
                setError('Server error. Please try again in a moment.')
            } else {
                setError(err.message || 'Failed to end session. Please try again.')
            }
        } finally {
            setIsEnding(false)
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

    // Add system messages to show responder entry/exit
    const addSystemMessages = (messages: Message[], chatData: Chat): Message[] => {
        const systemMessages: Message[] = []
        
        // Check if responder is currently assigned
        const hasResponder = chatData.responder_id || chatData.responder_name
        
        // Check if session is ended
        const isEnded = chatData.status === 'ended' || chatData.status === 'archived'
        
        // Find first responder message to determine when responder entered
        // Only count actual human responder messages, not AI agent messages
        const responderMessages = messages.filter(m => m.sender === 'responder' || (m.source === 'responder'))
        const firstResponderMessage = responderMessages[0]
        const lastResponderMessage = responderMessages[responderMessages.length - 1]
        
        // Add entry message if responder is active and there are responder messages
        // Place it before the first responder message
        if (hasResponder && firstResponderMessage && !isEnded) {
            // Use a timestamp slightly before the first responder message
            const entryTime = new Date(firstResponderMessage.sent_at)
            entryTime.setSeconds(entryTime.getSeconds() - 1)
            
            systemMessages.push({
                id: 'system-responder-entered',
                text: `👤 Human responder entered the conversation`,
                sent_at: entryTime.toISOString(),
                sender: 'system',
                type: 'system'
            })
        }
        
        // Add exit message if session is ended and there was a responder
        if (isEnded && lastResponderMessage) {
            // Use ended_at timestamp or slightly after last responder message
            const exitTime = chatData.ended_at 
                ? new Date(chatData.ended_at)
                : new Date(lastResponderMessage.sent_at)
            if (!chatData.ended_at) {
                exitTime.setSeconds(exitTime.getSeconds() + 1)
            }
            
            systemMessages.push({
                id: 'system-responder-exited',
                text: `🤖 AI agent resumed - Human responder session ended`,
                sent_at: exitTime.toISOString(),
                sender: 'system',
                type: 'ai_transition'
            })
        }
        
        // Combine and sort by timestamp
        const allMessages = [...messages, ...systemMessages].sort((a, b) => {
            return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        })
        
        return allMessages
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
        <div className="flex h-full min-h-0">
            {/* Center: Chat History & Input */}
            <div className="flex-1 flex flex-col h-full min-h-0 bg-white">
                {/* Chat Header */}
                <div className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm z-10 flex-shrink-0">
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
                            disabled={isEnding}
                        >
                            {isEnding ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Ending...
                                </>
                            ) : (
                                'End Session'
                            )}
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50 min-h-0" ref={scrollViewportRef}>
                    <div className="space-y-6 max-w-3xl mx-auto">
                        {isLoading ? (
                            <div className="text-center text-gray-400 py-8">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                <p>Loading messages...</p>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="text-center text-gray-400 py-8">
                                <p>No messages yet. Start the conversation!</p>
                                {chat?.series_chat_id && (
                                    <p className="text-xs mt-2 text-gray-300">
                                        Chat ID: {chat.series_chat_id}
                                    </p>
                                )}
                            </div>
                        ) : (
                            messages.map((msg, index) => {
                                // System messages (responder entry/exit)
                                if (msg.sender === 'system' || msg.type === 'system' || msg.type === 'ai_transition') {
                                    return (
                                        <div key={msg.id || `system-${index}`} className="flex justify-center my-4">
                                            <div className={`
                                                px-4 py-2 rounded-full text-xs font-medium
                                                ${msg.type === 'ai_transition' 
                                                    ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                                }
                                                flex items-center gap-2
                                            `}>
                                                {msg.type === 'ai_transition' ? '🤖' : '👤'}
                                                <span>{msg.text}</span>
                                                <span className="text-gray-400 ml-2">{formatTime(msg.sent_at)}</span>
                                            </div>
                                        </div>
                                    )
                                }
                                
                                // Regular messages - iMessage style layout
                                // Determine message source: user (left) vs our side (right)
                                const isUser = msg.sender === 'user' || msg.sender === 'receiver'
                                const isResponder = msg.sender === 'responder'
                                const isAIAgent = msg.sender === 'ai_agent' || (msg.source === 'ai_agent')
                                const isFromOurSide = isResponder || isAIAgent
                                
                                // Get sender label
                                const senderLabel = msg.sender_label || 
                                    (isResponder ? 'Human Responder' : 
                                     isAIAgent ? 'AI Agent' : 
                                     displayChat.user_display_name)
                                
                                // iMessage style: User messages on LEFT, Our messages on RIGHT
                                return (
                                    <div key={msg.id || `msg-${index}-${msg.sent_at}`} className={`flex gap-3 ${isFromOurSide ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {/* Avatar - only show for user messages (left side) */}
                                        {isUser && (
                                            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-gray-200 text-gray-600">
                                                💬
                                            </div>
                                        )}
                                        
                                        {/* Message bubble container */}
                                        <div className={`flex flex-col ${isFromOurSide ? 'items-end' : 'items-start'} flex-1 max-w-[75%]`}>
                                            {/* Sender label and timestamp - only show for our messages */}
                                            {isFromOurSide && (
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`
                                                        text-xs font-semibold
                                                        ${isResponder ? 'text-blue-600' : 'text-purple-600'}
                                                    `}>
                                                        {isResponder ? 'You (Human Responder)' : 'AI Agent'}
                                                    </span>
                                                    <span className="text-xs text-gray-400">{formatTime(msg.sent_at)}</span>
                                                </div>
                                            )}
                                            
                                            {/* Message bubble */}
                                            <div className={`
                                                px-4 py-2.5 rounded-2xl shadow-sm
                                                ${isFromOurSide
                                                    ? isResponder
                                                        ? 'bg-blue-500 text-white rounded-br-sm' // Blue for responder
                                                        : 'bg-purple-500 text-white rounded-br-sm' // Purple for AI
                                                    : 'bg-gray-200 text-gray-900 rounded-bl-sm' // Gray for user
                                                }
                                                ${isUser && displayChat.type === 'crisis' ? 'border-l-2 border-red-500' : ''}
                                            `}>
                                                <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                                    {msg.text}
                                                </div>
                                            </div>
                                            
                                            {/* Timestamp for user messages (below bubble) */}
                                            {isUser && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-gray-500 font-medium">{displayChat.user_display_name}</span>
                                                    <span className="text-xs text-gray-400">{formatTime(msg.sent_at)}</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Avatar for our messages (right side) - optional, can be hidden */}
                                        {isFromOurSide && (
                                            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold ${
                                                isResponder 
                                                    ? 'bg-blue-500 text-white' 
                                                    : 'bg-purple-500 text-white'
                                            }`}>
                                                {isResponder ? '👤' : '🤖'}
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area */}
                <div className="p-4 border-t bg-white flex-shrink-0">
                    {error && (
                        <div className="mb-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                            {error}
                        </div>
                    )}
                    
                    {/* Show message when session is ended */}
                    {(chat?.status === 'ended' || chat?.status === 'archived') && (
                        <div className="mb-3 text-xs text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <p className="font-medium">✓ Session Ended</p>
                            <p className="text-gray-600 mt-1">The AI agent is now handling this conversation. You cannot send messages until the user asks for help again and you accept a new alert.</p>
                        </div>
                    )}
                    
                    {!(chat?.status === 'ended' || chat?.status === 'archived') && (
                        <>
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
                        </>
                    )}
                </div>
            </div>

            {/* Right: Context Sidebar */}
            <ReceiverContextSidebar activeChatId={selectedChatId} />
        </div>
    )
}
