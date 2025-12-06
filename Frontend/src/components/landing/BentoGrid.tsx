import { QrCode, MessageSquareHeart, HeartHandshake, Lock, Clock, Gift } from "lucide-react"

const features = [
    {
        title: "Anonymous",
        description: "No names. No accounts. Encrypted.",
        icon: Lock,
        className: "md:col-span-1",
    },
    {
        title: "Instant Access",
        description: "Scan QR or text. Connect in <60s.",
        icon: Clock,
        className: "md:col-span-1",
    },
    {
        title: "Always Free",
        description: "Supported by grants, not your wallet.",
        icon: Gift,
        className: "md:col-span-1",
    },
    {
        title: "Spectrum Support",
        description: "From 'kind of sad' to 'in crisis'. We handle it all.",
        icon: HeartHandshake,
        className: "md:col-span-2",
    },
    {
        title: "AI + Human",
        description: "Instant AI guidance via MCP, escalated to humans when you need connection.",
        icon: MessageSquareHeart,
        className: "md:col-span-1",
    },
]

export function BentoGrid() {
    return (
        <section className="py-24 px-6 bg-black relative z-10">
            <div className="max-w-4xl mx-auto">
                <h2 className="text-3xl font-bold text-white mb-12 text-center tracking-tight">
                    System Features
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className={`group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-colors duration-300 ${feature.className}`}
                        >
                            <div className="mb-4 text-white/70 group-hover:text-white transition-colors">
                                <feature.icon size={28} />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
