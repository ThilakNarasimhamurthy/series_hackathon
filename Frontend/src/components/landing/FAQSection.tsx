import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

const faqs = [
    {
        question: "Who will I talk to?",
        answer: "You'll connect with trained volunteers, peer supporters with lived experience, or licensed professionals depending on your needs. All responders are vetted and supervised.",
    },
    {
        question: "Is this confidential?",
        answer: "Yes. We don't store your name or real identity unless you choose to share it. Your phone number is encrypted and our responders only see a secure alias.",
    },
    {
        question: "What if I'm in crisis?",
        answer: "Our system detects urgent keywords immediately. If you're in danger, we connect you with a crisis counselor within 60 seconds and provide emergency hotline numbers. We prioritize your safety above all else.",
    },
    {
        question: "How quickly will someone respond?",
        answer: "Our AI responds instantly to acknowledge your message. Human responders typically connect within 2-5 minutes. For crisis situations, our goal is under 60 seconds.",
    },
]

export function FAQSection() {
    return (
        <section className="py-20 bg-white px-6">
            <div className="max-w-3xl mx-auto">
                <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
                    Frequently Asked Questions
                </h2>
                <Accordion type="single" collapsible className="w-full space-y-4">
                    {faqs.map((faq, index) => (
                        <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-4 shadow-sm">
                            <AccordionTrigger className="text-lg font-semibold text-gray-800 hover:text-blue-600">
                                {faq.question}
                            </AccordionTrigger>
                            <AccordionContent className="text-gray-600 text-base leading-relaxed pb-4">
                                {faq.answer}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </section>
    )
}
