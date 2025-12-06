"use client"

import { useResponderStore } from "@/lib/store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Zap, TrendingDown } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export function CrisisAlertPanel() {
    const alerts = useResponderStore((state) => state.alerts)
    const removeAlert = useResponderStore((state) => state.removeAlert)

    return (
        <div className="flex flex-col h-1/2 border-b">
            <div className="p-4 border-b bg-red-50 flex items-center justify-between">
                <h2 className="font-bold text-red-900 flex items-center gap-2">
                    <Zap className="h-5 w-5 fill-red-600 text-red-600" />
                    Crisis Alerts ({alerts.length})
                </h2>
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
            </div>

            <ScrollArea className="flex-1 p-4 bg-red-50/30">
                <div className="space-y-4">
                    <AnimatePresence mode="popLayout">
                        {alerts.map((alert) => (
                            <motion.div
                                key={alert.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.3 }}
                                layout
                            >
                                <Card className="border-l-4 border-l-red-600 shadow-sm p-4 space-y-3 bg-white hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start">
                                        <div className="flex gap-2">
                                            <Badge variant="destructive" className="uppercase text-[10px] tracking-wider">
                                                {alert.severity}
                                            </Badge>
                                            <span className="text-xs text-gray-500 font-mono pt-0.5">{alert.timestamp}</span>
                                        </div>
                                        <span className="text-2xl" role="img" aria-label="mood">🆘</span>
                                    </div>

                                    <div>
                                        <h3 className="font-semibold text-gray-900">{alert.user_alias}</h3>
                                        <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
                                            <TrendingDown className="h-3 w-3" />
                                            Declining mood trend
                                        </div>
                                    </div>

                                    <div className="bg-red-50 p-2 rounded text-sm text-gray-700 italic border border-red-100">
                                        &ldquo;
                                        <span dangerouslySetInnerHTML={{ __html: alert.message_preview.replace(/<span class='highlight'>/g, "<span class='bg-red-200 font-bold px-0.5 rounded'>") }} />
                                        &rdquo;
                                    </div>

                                    <div className="flex flex-wrap gap-1">
                                        {alert.detected_keywords.map((kw) => (
                                            <Badge key={kw} variant="outline" className="text-xs border-red-200 text-red-700 bg-red-50">
                                                {kw}
                                            </Badge>
                                        ))}
                                    </div>

                                    <Button
                                        className="w-full bg-red-600 hover:bg-red-700 text-white shadow-red-100"
                                        onClick={() => removeAlert(alert.id)}
                                    >
                                        Accept Match
                                    </Button>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </ScrollArea>
        </div>
    )
}
