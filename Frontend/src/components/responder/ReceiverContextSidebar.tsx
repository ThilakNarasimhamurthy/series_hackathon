"use client"

import { Card } from "@/components/ui/card"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts"
import { apiClient } from "@/lib/api"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

interface ReceiverContextSidebarProps {
    activeChatId: string | null
}

export function ReceiverContextSidebar({ activeChatId }: ReceiverContextSidebarProps) {
    const [chat, setChat] = useState<any>(null)
    const [checkins, setCheckins] = useState<any[]>([])
    const [journalEntries, setJournalEntries] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (!activeChatId) {
            setChat(null)
            setCheckins([])
            setJournalEntries([])
            return
        }

        // Debounce to avoid rapid successive calls (especially when ChatInterface is also fetching)
        const timeoutId = setTimeout(async () => {
            async function fetchContext() {
                setIsLoading(true)
                try {
                    // Fetch chat data
                    const chatData = await apiClient.getChatWithMessages(activeChatId)
                    setChat(chatData)

                    // Fetch check-ins if user_id is available
                    if (chatData.user_id) {
                        try {
                            // Note: We need user phone to fetch check-ins, but we don't have it
                            // For now, we'll skip this or create a new endpoint
                            // const checkinsData = await apiClient.getUserCheckins(chatData.user_phone)
                            // setCheckins(checkinsData)
                        } catch (err) {
                            console.warn('Could not fetch check-ins:', err)
                        }
                    }
                } catch (err: any) {
                    // Handle rate limit errors gracefully
                    if (err.message?.includes('Too many requests') || err.message?.includes('429')) {
                        console.warn('Rate limit reached for context fetch, will retry later')
                        // Don't set error state, just log it
                    } else {
                        console.error('Error fetching context:', err)
                    }
                } finally {
                    setIsLoading(false)
                }
            }

            fetchContext()
        }, 500) // 500ms debounce to avoid simultaneous calls with ChatInterface

        return () => clearTimeout(timeoutId)
    }, [activeChatId])

    // Generate mood trend data from check-ins (mock for now until we have check-ins endpoint)
    const moodData = checkins.length > 0 
        ? checkins.slice(0, 7).map((c, idx) => ({
            day: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][idx] || 'M',
            score: c.mood === '😊' ? 5 : c.mood === '😐' ? 3 : c.mood === '😞' ? 2 : c.mood === '😰' ? 1 : 3
        }))
        : [
            { day: 'M', score: 3 },
            { day: 'T', score: 3 },
            { day: 'W', score: 2 },
            { day: 'T', score: 2 },
            { day: 'F', score: 1 },
            { day: 'S', score: 1 },
            { day: 'S', score: 1 },
        ]

    if (!activeChatId) {
        return (
            <div className="h-full border-l bg-white w-80 flex items-center justify-center text-gray-400">
                <p className="text-sm">Select a chat to view context</p>
            </div>
        )
    }

    return (
        <div className="h-full border-l bg-white custom-scrollbar w-80 flex flex-col overflow-y-auto">
            <div className="p-4 border-b">
                <h3 className="font-bold text-gray-900">Receiver Context</h3>
                <p className="text-xs text-gray-500">History & Trends</p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            ) : (
                <div className="p-4 space-y-6">
                    {/* Mood Trend Chart */}
                    <Card className="p-4 shadow-none border-gray-200 bg-black">
                        <h4 className="text-sm font-semibold mb-6 text-gray-100">Mood Trend (7 Days)</h4>
                        <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={moodData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <XAxis
                                        dataKey="day"
                                        tick={{ fontSize: 12, fill: '#ffffff' }}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                        padding={{ left: 15, right: 15 }}
                                    />
                                    <YAxis
                                        domain={[1, 5]}
                                        tick={{ fontSize: 10, fill: '#9CA3AF' }}
                                        tickCount={5}
                                        width={30}
                                        axisLine={false}
                                        tickLine={false}
                                        padding={{ bottom: 10, top: 10 }}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB', color: '#111827' }}
                                        itemStyle={{ color: '#111827' }}
                                    />
                                    <Line type="monotone" dataKey="score" stroke="#DC2626" strokeWidth={2} dot={{ r: 3, fill: '#DC2626' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="text-xs text-red-600 font-medium text-center mt-2 flex justify-center items-center gap-1">
                            📉 Trend detected for {chat?.user_display_name || 'User'}
                        </div>
                    </Card>

                    {/* Check-ins */}
                    <Accordion type="single" collapsible defaultValue="checkins" className="w-full">
                        <AccordionItem value="checkins">
                            <AccordionTrigger className="text-sm font-semibold text-gray-900">Recent Check-ins</AccordionTrigger>
                            <AccordionContent>
                                <div className="space-y-3">
                                    {checkins.length === 0 ? (
                                        <div className="text-xs text-gray-400 text-center py-4">
                                            No check-ins available
                                        </div>
                                    ) : (
                                        checkins.slice(0, 3).map((checkin, i) => (
                                            <div key={i} className="flex gap-3 items-start p-2 rounded bg-gray-50">
                                                <span className="text-xl">{checkin.mood || '😐'}</span>
                                                <div>
                                                    <div className="flex justify-between items-center w-full">
                                                        <span className="text-xs text-gray-500">
                                                            {new Date(checkin.timestamp).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    {checkin.text && (
                                                        <p className="text-xs text-gray-700 mt-1">{checkin.text}</p>
                                                    )}
                                                    {checkin.tags && checkin.tags.length > 0 && (
                                                        <div className="mt-1 flex gap-1">
                                                            {checkin.tags.map((tag: string, idx: number) => (
                                                                <Badge key={idx} variant="outline" className="text-[10px] h-4 text-gray-600 border-gray-300">
                                                                    {tag}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="journals">
                            <AccordionTrigger className="text-sm font-semibold text-gray-900">Journal Entries</AccordionTrigger>
                            <AccordionContent>
                                {journalEntries.length === 0 ? (
                                    <div className="text-xs text-gray-400 text-center py-4">
                                        No journal entries available
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {journalEntries.slice(0, 2).map((entry, idx) => (
                                            <div key={idx} className="p-2 bg-yellow-50 rounded border border-yellow-100 text-xs text-gray-700">
                                                &ldquo;{entry.content}&rdquo;
                                                <div className="mt-2 text-right text-gray-400 font-mono">
                                                    {new Date(entry.timestamp).toLocaleDateString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            )}
        </div>
    )
}
