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
import { MOCK_ACTIVE_CHATS } from "@/lib/mockData"

interface ReceiverContextSidebarProps {
    activeChatId: string | null
}

export function ReceiverContextSidebar({ activeChatId }: ReceiverContextSidebarProps) {
    const activeChat = MOCK_ACTIVE_CHATS.find(c => c.id === activeChatId)

    // Default data if no chat selected or no custom data
    const moodData = activeChat?.mood_trend_data || [
        { day: 'M', score: 3 },
        { day: 'T', score: 3 },
        { day: 'W', score: 2 },
        { day: 'T', score: 2 },
        { day: 'F', score: 1 },
        { day: 'S', score: 1 },
        { day: 'S', score: 1 },
    ]

    return (
        <div className="h-full border-l bg-white custom-scrollbar w-80 flex flex-col overflow-y-auto">
            <div className="p-4 border-b">
                <h3 className="font-bold text-gray-900">Receiver Context</h3>
                <p className="text-xs text-gray-500">History & Trends</p>
            </div>

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
                        📉 Trend detected for {activeChat?.user_alias || 'User'}
                    </div>
                </Card>

                {/* Check-ins */}
                <Accordion type="single" collapsible defaultValue="checkins" className="w-full">
                    <AccordionItem value="checkins">
                        <AccordionTrigger className="text-sm font-semibold text-gray-900">Recent Check-ins</AccordionTrigger>
                        <AccordionContent>
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex gap-3 items-start p-2 rounded bg-gray-50">
                                        <span className="text-xl">😞</span>
                                        <div>
                                            <div className="flex justify-between items-center w-full">
                                                <span className="text-xs text-gray-500">Today, 9:00 AM</span>
                                            </div>
                                            <p className="text-xs text-gray-700 mt-1">Feeling really heavy today. Work is stressful.</p>
                                            <div className="mt-1 flex gap-1">
                                                <Badge variant="outline" className="text-[10px] h-4 text-gray-600 border-gray-300">Work</Badge>
                                                <Badge variant="outline" className="text-[10px] h-4 text-gray-600 border-gray-300">Stress</Badge>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="journals">
                        <AccordionTrigger className="text-sm font-semibold text-gray-900">Journal Entries</AccordionTrigger>
                        <AccordionContent>
                            <div className="p-2 bg-yellow-50 rounded border border-yellow-100 text-xs text-gray-700">
                                &ldquo;I keep thinking about just giving up. It feels easier than trying.&rdquo;
                                <div className="mt-2 text-right text-gray-400 font-mono">Yesterday</div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>
    )
}
