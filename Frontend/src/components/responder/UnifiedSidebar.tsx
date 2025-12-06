"use client"

import { useResponderStore } from "@/lib/store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Inbox, Zap, MessageSquare, Clock, ChevronRight, AlertCircle, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect } from "react"
import { apiClient } from "@/lib/api"

interface Alert {
    id: string
    severity: string
    user_display_name: string
    mood_score?: number
    message_preview: string
    detected_keywords?: string[]
    created_at: string
    status: string
}

interface Chat {
    id: string
    user_display_name: string
    last_message?: string
    last_message_at?: string
    status: string
    unread_count?: number
}

export function UnifiedSidebar() {
    const { selectedChatId, setSelectedChatId } = useResponderStore()
    const [activeTab, setActiveTab] = useState<"all" | "crisis" | "active">("all")
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [chats, setChats] = useState<Chat[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Fetch alerts and chats from backend
    useEffect(() => {
        async function fetchData() {
            setIsLoading(true)
            setError(null)
            
            try {
                // Fetch pending alerts for this responder only
                // Responders can ONLY see alerts assigned to them
                // TODO: Get responder ID from auth context
                const responderId = 'default-responder'
                const alertsData = await apiClient.getPendingAlerts(responderId)
                if (alertsData && Array.isArray(alertsData)) {
                    setAlerts(alertsData.map((alert: any) => ({
                        id: alert.id,
                        severity: alert.severity || 'high',
                        user_display_name: alert.user_display_name || alert.user_alias || 'Anonymous',
                        mood_score: alert.mood_score,
                        message_preview: alert.context?.message_preview || alert.context?.message || alert.message_preview || alert.message || '',
                        detected_keywords: alert.context?.detected_keywords || alert.detected_keywords,
                        created_at: alert.created_at || alert.timestamp,
                        status: alert.status || 'pending'
                    })))
                }

                // Fetch active chats for this responder
                // Using the same responderId from above
                try {
                    const chatsData = await apiClient.getResponderChats(responderId)
                    if (chatsData && Array.isArray(chatsData)) {
                        const mappedChats = chatsData.map((chat: any) => ({
                            id: chat.id,
                            user_display_name: chat.user_display_name || chat.user_alias || 'Anonymous',
                            last_message: chat.last_message,
                            last_message_at: chat.last_message_at || chat.timestamp,
                            status: chat.status || 'active',
                            unread_count: chat.unread_count || 0
                        }))
                        
                        // Deduplicate: Keep only the most recent chat per user_display_name
                        const deduplicatedChats = mappedChats.reduce((acc: any[], chat: any) => {
                            const existingChat = acc.find(c => c.user_display_name === chat.user_display_name)
                            if (!existingChat) {
                                acc.push(chat)
                            } else {
                                // Keep the most recent one (compare by last_message_at or created_at)
                                const existingTime = new Date(existingChat.last_message_at || existingChat.id).getTime()
                                const newTime = new Date(chat.last_message_at || chat.id).getTime()
                                if (newTime > existingTime) {
                                    const index = acc.indexOf(existingChat)
                                    acc[index] = chat
                                }
                            }
                            return acc
                        }, [])
                        
                        setChats(deduplicatedChats)
                    } else {
                        // If we get invalid data, keep existing chats instead of clearing
                        console.warn('Invalid chats data received, keeping existing chats')
                    }
                } catch (chatError) {
                    // If responder chats fail, keep existing chats instead of clearing
                    console.warn('Failed to fetch responder chats, keeping existing chats:', chatError)
                    // Don't clear chats on error - keep what we have
                }
            } catch (err: any) {
                // Handle rate limit errors gracefully
                if (err.message?.includes('Too many requests') || err.status === 429) {
                    console.warn('Rate limit reached, will retry on next interval')
                    // Don't set error state for rate limits, just silently retry
                } else {
                    console.error('Error fetching data:', err)
                    setError(err instanceof Error ? err.message : 'Failed to load data')
                    // Don't clear existing chats/alerts on error - keep what we have
                }
            } finally {
                setIsLoading(false)
            }
        }

        fetchData()
        
        // Refresh every 45 seconds (reduced frequency to avoid rate limits)
        const interval = setInterval(fetchData, 45000)
        return () => clearInterval(interval)
    }, [])

    const handleAcceptAlert = async (alertId: string) => {
        try {
            // Get responder ID (TODO: Get from auth context)
            const responderId = 'default-responder'
            
            // Use the accept endpoint which creates chat and assigns responder
            const response = await apiClient.acceptAlert(alertId, responderId)
            
            // Remove alert from list
            setAlerts(prev => prev.filter(a => a.id !== alertId))
            
            // Refresh chats to show the newly created chat
            // The chat will appear in active sessions
            const responderIdForChats = 'default-responder'
            try {
                const chatsData = await apiClient.getResponderChats(responderIdForChats)
                if (chatsData && Array.isArray(chatsData)) {
                    const mappedChats = chatsData.map((chat: any) => ({
                        id: chat.id,
                        user_display_name: chat.user_display_name || 'Anonymous',
                        type: chat.type || 'general',
                        status: chat.status || 'active',
                        last_message: chat.last_message,
                        last_message_at: chat.last_message_at,
                        created_at: chat.created_at,
                        unread_count: chat.unread_count || 0
                    }))
                    
                    // Deduplicate: Keep only the most recent chat per user_display_name
                    const deduplicatedChats = mappedChats.reduce((acc: any[], chat: any) => {
                        const existingChat = acc.find(c => c.user_display_name === chat.user_display_name)
                        if (!existingChat) {
                            acc.push(chat)
                        } else {
                            // Keep the most recent one
                            const existingTime = new Date(existingChat.last_message_at || existingChat.created_at || existingChat.id).getTime()
                            const newTime = new Date(chat.last_message_at || chat.created_at || chat.id).getTime()
                            if (newTime > existingTime) {
                                const index = acc.indexOf(existingChat)
                                acc[index] = chat
                            }
                        }
                        return acc
                    }, [])
                    
                    setChats(deduplicatedChats)
                }
            } catch (chatError) {
                console.warn('Failed to refresh chats after accepting alert:', chatError)
            }
            
            console.log('✅ Alert accepted, chat created:', response.chat)
            setError(null) // Clear any previous errors
        } catch (err: any) {
            console.error('Error accepting alert:', err)
            // Extract error message from various possible locations
            let errorMessage = 'Failed to accept alert'
            if (err instanceof Error) {
                errorMessage = err.message
            } else if (err?.data?.error) {
                errorMessage = err.data.error
            } else if (err?.data?.message) {
                errorMessage = err.data.message
            } else if (err?.data?.details) {
                errorMessage = err.data.details
            } else if (typeof err === 'string') {
                errorMessage = err
            }
            
            // Show specific error messages for common cases
            if (err?.status === 403) {
                if (errorMessage.includes('available')) {
                    errorMessage = 'You must be available (online) to accept cases. Please set your status to available first.'
                } else if (errorMessage.includes('already assigned')) {
                    errorMessage = 'This alert has already been accepted by another responder.'
                }
            } else if (err?.status === 404) {
                if (errorMessage.includes('Responder not found')) {
                    errorMessage = 'Responder not found. Please try again.'
                } else if (errorMessage.includes('Alert not found')) {
                    errorMessage = 'This alert no longer exists. It may have been resolved or accepted by someone else.'
                }
            }
            
            setError(errorMessage)
        }
    }

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

    const filteredAlerts = activeTab === 'crisis' ? alerts : alerts
    const filteredChats = activeTab === 'active' ? chats.filter(c => c.status === 'active') : chats

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
                        {alerts.length + chats.length} Total
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
                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : error ? (
                    <div className="p-4 text-sm text-red-600">
                        {error}
                    </div>
                ) : (
                <div className="p-3 space-y-6">
                    {/* INCOMING TRIAGE (Crisis) */}
                        {(activeTab === "all" || activeTab === "crisis") && filteredAlerts.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold text-red-900 uppercase tracking-wider px-2 flex items-center justify-between">
                                <span>Incoming Triage</span>
                                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            </h3>

                            <AnimatePresence mode="popLayout">
                                    {filteredAlerts.map(alert => (
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
                                                        <span className="font-bold text-gray-900">{alert.user_display_name}</span>
                                                    <Badge className="bg-red-50 text-red-700 border-red-100 text-[10px] px-1.5 hover:bg-red-100">
                                                        {alert.severity}
                                                    </Badge>
                                                </div>
                                                    <span className="text-[10px] text-gray-400 font-mono">{formatTimestamp(alert.created_at)}</span>
                                            </div>

                                            <p className="text-sm text-gray-600 line-clamp-2 pl-2 mb-3 leading-relaxed">
                                                <span className="text-red-400 mr-1">Detected:</span>
                                                    {alert.message_preview}
                                            </p>

                                            <div className="pl-2">
                                                <Button
                                                    size="sm"
                                                    className="w-full bg-gray-900 text-white hover:bg-gray-800 h-8 text-xs font-medium"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                            handleAcceptAlert(alert.id)
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
                        {(activeTab === "all" && alerts.length > 0 && chats.length > 0) && <Separator />}

                    {/* ACTIVE CASELOAD */}
                    {(activeTab === "all" || activeTab === "active") && (
                        <div className="space-y-2">
                            {activeTab === "all" && (
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">
                                    Active Sessions
                                </h3>
                            )}

                                {filteredChats.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-gray-400">
                                        No active chats
                                    </div>
                                ) : (
                                    filteredChats.map(chat => (
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
                                                        {chat.user_display_name}
                                            </span>
                                                    {chat.status === 'crisis' && <AlertCircle className="w-3 h-3 text-red-500" />}
                                        </div>
                                                <span className="text-[10px] text-gray-400">{formatTimestamp(chat.last_message_at || chat.id)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-gray-500 truncate max-w-[180px]">
                                                    {chat.last_message || 'No messages yet'}
                                        </p>
                                                {chat.unread_count && chat.unread_count > 0 && (
                                            <Badge className="h-5 min-w-5 rounded-full px-1.5 flex items-center justify-center bg-blue-600 text-[10px]">
                                                {chat.unread_count}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                    ))
                                )}
                        </div>
                    )}
                </div>
                )}
            </ScrollArea>
        </div>
    )
}
