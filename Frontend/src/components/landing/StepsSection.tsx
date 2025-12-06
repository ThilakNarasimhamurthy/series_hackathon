import { QrCode, MessageSquareHeart, HeartHandshake } from "lucide-react"

const steps = [
    {
        icon: QrCode,
        title: "Scan or Save",
        description: "Scan the QR code or save the number to your contacts.",
    },
    {
        icon: MessageSquareHeart,
        title: "Text Your Feelings",
        description: "Send an emoji (😊😐😞😰🆘) or describe how you're feeling.",
    },
    {
        icon: HeartHandshake,
        title: "Get Instant Support",
        description: "Receive AI guidance immediately or connect with a trained responder.",
    },
]

export function StepsSection() {
    return (
        <section className="py-20 bg-white px-6">
            <div className="max-w-6xl mx-auto">
                <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
                    How it Works
                </h2>
                <div className="grid md:grid-cols-3 gap-8">
                    {steps.map((step, index) => (
                        <div
                            key={index}
                            className="bg-white rounded-xl p-8 shadow-lg border border-gray-100 flex flex-col items-center text-center space-y-4 hover:shadow-xl transition-shadow duration-300"
                        >
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-2">
                                <step.icon size={32} />
                            </div>
                            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mb-2">
                                {index + 1}
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">{step.title}</h3>
                            <p className="text-gray-600">{step.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
