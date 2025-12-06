import { Lock, Clock, Gift } from "lucide-react"

const values = [
    {
        icon: Lock,
        title: "Completely Anonymous",
        description: "Your privacy matters. No names, no judgment, completely confidential. We encrypt all data.",
    },
    {
        icon: Clock,
        title: "24/7 Availability",
        description: "Always here for you. Day or night, weekday or weekend. Support never sleeps.",
    },
    {
        icon: Gift,
        title: "100% Free Access",
        description: "No cost, no insurance required. Mental health support should never have a price tag.",
    },
]

export function ValuePropsSection() {
    return (
        <section className="py-20 bg-gray-50 px-6">
            <div className="max-w-6xl mx-auto">
                <div className="grid md:grid-cols-3 gap-12">
                    {values.map((value, index) => (
                        <div key={index} className="flex flex-col items-center text-center space-y-4">
                            <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center text-blue-500 mb-2 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                                <value.icon size={40} />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-800">{value.title}</h3>
                            <p className="text-gray-600 text-lg leading-relaxed">
                                {value.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
