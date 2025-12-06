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

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 1000))

        setIsLoading(false)
        setIsSubmitted(true)
        console.log("Requested callback for:", values.phone)
    }

    if (isSubmitted) {
        return (
            <div className="flex items-center gap-2 text-green-400 bg-green-950/30 px-4 py-2 rounded-lg border border-green-900 animate-in fade-in zoom-in duration-300">
                <Check className="w-5 h-5" />
                <span className="font-medium">Request sent. A responder will text you.</span>
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
