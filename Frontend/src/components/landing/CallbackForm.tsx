"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Check, Loader2 } from "lucide-react"


const formSchema = z.object({
    phone: z.string().min(10, "Please enter a valid phone number"),
})

export function CallbackForm() {
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            phone: "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true)

        try {
            // Format phone number (add + if not present)
            let phoneNumber = values.phone.trim()
            if (!phoneNumber.startsWith('+')) {
                // Assume US number if no country code
                if (phoneNumber.length === 10) {
                    phoneNumber = `+1${phoneNumber}`
                } else {
                    phoneNumber = `+${phoneNumber}`
                }
            }

            // Call backend API
            const { apiClient } = await import('@/lib/api')
            const response = await apiClient.sendWelcome(phoneNumber)

            setIsLoading(false)
            
            // Check if response has warning (phone not whitelisted but user created)
            if ((response as any).warning) {
                setIsSubmitted(true)
                form.setError("phone", {
                    type: "manual",
                    message: (response as any).suggestion || (response as any).message || "Account created! Send a message first to start receiving support."
                })
            } else {
                setIsSubmitted(true)
                console.log("Welcome message sent:", response)
            }
        } catch (error) {
            console.error("Error sending welcome message:", error)
            setIsLoading(false)
            
            // Extract user-friendly error message
            let errorMessage = "Failed to send message. Please try again.";
            
            if (error instanceof Error) {
                errorMessage = error.message;
                
                // Make error messages more user-friendly
                if (errorMessage.includes('E.164 format')) {
                    errorMessage = "Please enter a valid phone number with country code (e.g., +1234567890)";
                } else if (errorMessage.includes('required')) {
                    errorMessage = "Phone number is required";
                } else if (errorMessage.includes('Series API') || errorMessage.includes('service unavailable')) {
                    errorMessage = "Service temporarily unavailable. Please try again later.";
                } else if (errorMessage.includes('Too many requests')) {
                    errorMessage = "Too many requests. Please wait a moment and try again.";
                }
            }
            
            // Show error to user
            form.setError("phone", {
                type: "manual",
                message: errorMessage
            })
        }
    }

    if (isSubmitted) {
        const hasError = form.formState.errors.phone;
        return (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border animate-in fade-in zoom-in duration-300 ${
                hasError 
                    ? "text-yellow-400 bg-yellow-950/30 border-yellow-900" 
                    : "text-green-400 bg-green-950/30 border-green-900"
            }`}>
                <Check className="w-5 h-5" />
                <span className="font-medium">
                    {hasError 
                        ? "Account created! Send a message first to start receiving support."
                        : "Request sent. A responder will text you."
                    }
                </span>
            </div>
        )
    }

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-full max-w-sm items-center gap-2">
            <div className="relative flex-1">
                <Input
                    placeholder="Enter your number..."
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-white/30 focus:ring-0 h-12 pr-4 transition-all"
                    {...form.register("phone")}
                />
            </div>
            <Button
                type="submit"
                size="icon"
                className="h-12 w-12 bg-white text-black hover:bg-gray-200 shrink-0 rounded-lg transition-all"
                disabled={isLoading}
            >
                {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                    <ArrowRight className="h-5 w-5" />
                )}
            </Button>
        </form>
    )
}
