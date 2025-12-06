"use client"

import { QRCodeSVG } from "qrcode.react"
import { Phone, ArrowRight } from "lucide-react"
import { Hero3D } from "@/components/landing/Hero3D"
import { Button } from "@/components/ui/button"
import { CallbackForm } from "@/components/landing/CallbackForm"

const SUPPORT_NUMBER = "+16463458837"
const VCARD_DATA = `BEGIN:VCARD
VERSION:3.0
FN:Mental Health Support
TEL:${SUPPORT_NUMBER}
END:VCARD`

export function HeroSection() {
    return (
        <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black text-white pt-20">
            <Hero3D />

            <div className="relative z-10 max-w-4xl mx-auto px-6 text-center space-y-12">
                <div className="space-y-6">
                    <div className="inline-block rounded-full bg-white/10 px-3 py-1 text-sm text-white/80 backdrop-blur-sm border border-white/10 mb-4">
                        v1.0 Public Beta
                    </div>
                    <h1 className="text-5xl md:text-8xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 pb-2">
                        Talk to someone. <br />
                        <span className="text-white">Right now.</span>
                    </h1>
                    <p className="text-xl text-gray-400 max-w-lg mx-auto leading-relaxed">
                        No apps. No signup. Just text.
                        <br />
                        Secure mental health support for the modern era.
                    </p>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                    {/* QR Card */}
                    <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 hover:border-white/20 transition-colors group">
                        <div className="bg-white p-2 rounded-lg mb-4">
                            <QRCodeSVG
                                value={VCARD_DATA}
                                size={180}
                                level="H"
                            />
                        </div>
                        <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">Scan to Start</p>
                    </div>

                    <div className="flex flex-col items-center md:items-start gap-4">
                        <a
                            href={`tel:${SUPPORT_NUMBER}`}
                            className="group flex items-center gap-3 text-3xl md:text-4xl font-bold text-white hover:text-gray-200 transition-colors"
                        >
                            <span>{SUPPORT_NUMBER}</span>
                            <ArrowRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
                        </a>

                        <div className="flex flex-col gap-2 w-full">
                            <p className="text-sm text-gray-500">
                                Tap to call or enter your number below:
                            </p>
                            <CallbackForm />
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-10 left-0 right-0 text-center text-gray-600 text-xs uppercase tracking-widest z-10">
                Scroll to explore
            </div>
        </section>
    )
}
